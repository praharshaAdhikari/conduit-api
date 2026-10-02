import {
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { CronJob } from 'cron';
import { DataSource, In, LessThan, Repository } from 'typeorm';
import { ApiError } from '../common/api-error';
import { Clock } from '../common/clock';
import { PaginationQuery } from '../common/pagination.dto';
import { reconcileSettings } from '../config/env';
import {
  graceEndsAt,
  MembershipChange,
  reasonOf,
} from '../membership/lifecycle';
import { Membership } from '../membership/membership.entity';
import { MembershipService } from '../membership/membership.service';
import type { FollowUp } from '../membership/membership.service';
import { PAYMENT_PROVIDER } from '../payment/payment-provider';
import type {
  PaymentProvider,
  ProviderSubscription,
} from '../payment/payment-provider';
import { Payment } from '../payment/payment.entity';
import { TipService } from '../tip/tip.service';
import {
  ReconcileReport,
  ReconcileRun,
  ReconcileRunView,
  ReconcileStarter,
  toRunView,
} from './reconcile.entity';

const LOCK_NAME = 'conduit_reconcile';
/** How long an unpaid checkout, or a guest tip waiting for its code, is kept open. */
export const ABANDONED_AFTER_MS = 24 * 60 * 60 * 1000;

/**
 * What to change so that a membership agrees with the provider's view of its
 * subscription; null when they already agree. This is what a webhook that
 * never arrived would have done.
 */
export function changeToMatch(
  membership: Pick<
    Membership,
    'status' | 'cancelAtPeriodEnd' | 'currentPeriodEnd'
  >,
  subscription: ProviderSubscription | null,
): MembershipChange | null {
  if (subscription === null || subscription.status === 'ended') {
    return { type: 'ended' };
  }
  if (subscription.status === 'past_due') {
    return membership.status === 'active' ? { type: 'payment_failed' } : null;
  }
  if (membership.status === 'past_due') {
    return { type: 'paid', periodEnd: subscription.currentPeriodEnd };
  }
  if (membership.cancelAtPeriodEnd !== subscription.cancelAtPeriodEnd) {
    return {
      type: 'cancel_at_period_end',
      value: subscription.cancelAtPeriodEnd,
      periodEnd: subscription.currentPeriodEnd,
    };
  }
  const sameEnd =
    membership.currentPeriodEnd?.getTime() ===
    subscription.currentPeriodEnd.getTime();
  return sameEnd
    ? null
    : { type: 'period_synced', periodEnd: subscription.currentPeriodEnd };
}

// Puts right what webhooks alone cannot: events that never arrived, and
// things that happen only because time passed. It runs every night, from the
// command line (npm run membership:reconcile) and on an admin's request.
@Injectable()
export class ReconcileService implements OnApplicationBootstrap {
  private readonly logger = new Logger('Reconcile');

  constructor(
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(ReconcileRun)
    private readonly runs: Repository<ReconcileRun>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly membershipService: MembershipService,
    private readonly tips: TipService,
    private readonly dataSource: DataSource,
    private readonly scheduler: SchedulerRegistry,
    private readonly clock: Clock,
  ) {}

  onApplicationBootstrap(): void {
    const { cron } = reconcileSettings();
    if (cron === null) return;
    const job = CronJob.from({
      cronTime: cron,
      timeZone: 'UTC',
      onTick: () =>
        void this.run('schedule').catch((error) =>
          this.logger.warn(
            `The scheduled run did not happen: ${String(error)}`,
          ),
        ),
    });
    this.scheduler.addCronJob('reconcile', job);
    job.start();
  }

  /** Runs the job, unless a run is already in progress (409). */
  async run(startedBy: ReconcileStarter): Promise<ReconcileRunView> {
    // A named lock in MySQL, so two runs cannot overlap even from two
    // processes. It belongs to one connection, which is held for the run.
    const connection = this.dataSource.createQueryRunner();
    await connection.connect();
    try {
      const [{ locked }] = (await connection.query(
        'SELECT GET_LOCK(?, 0) AS locked',
        [LOCK_NAME],
      )) as { locked: string | number }[];
      if (Number(locked) !== 1) {
        throw new ApiError(HttpStatus.CONFLICT, {
          reconcile: ['is already running'],
        });
      }

      const run = await this.runs.save(
        this.runs.create({
          startedBy,
          startedAt: this.clock.now(),
          finishedAt: null,
          report: null,
        }),
      );
      run.report = await this.reconcile();
      run.finishedAt = this.clock.now();
      await this.runs.save(run);

      const { membershipsChanged, errors } = run.report;
      this.logger.log(
        `Run ${run.id} (${startedBy}): ${membershipsChanged.length} membership(s) changed, ${errors.length} error(s)`,
      );
      return toRunView(run);
    } finally {
      await connection.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
      await connection.release();
    }
  }

  /** Earlier runs, newest first. */
  async list({ limit, offset }: PaginationQuery) {
    const [rows, runsCount] = await this.runs.findAndCount({
      order: { startedAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { runs: rows.map(toRunView), runsCount };
  }

  private async reconcile(): Promise<ReconcileReport> {
    const report: ReconcileReport = {
      membershipsChecked: 0,
      membershipsChanged: [],
      checkoutsExpired: 0,
      tipsExpired: 0,
      errors: [],
    };
    // Emails are sent at the end, once everything is saved.
    const followUps: FollowUp[] = [];

    await this.matchProvider(report, followUps);
    await this.endGrace(report, followUps);
    await this.expireCheckouts(report, followUps);
    report.tipsExpired = await this.tips.expireUnconfirmed(
      new Date(this.clock.now().getTime() - ABANDONED_AFTER_MS),
    );

    for (const followUp of followUps) {
      await followUp().catch((error) => report.errors.push(String(error)));
    }
    return report;
  }

  /** Compares every running subscription with the provider and applies the difference. */
  private async matchProvider(
    report: ReconcileReport,
    followUps: FollowUp[],
  ): Promise<void> {
    const live = await this.memberships.find({
      where: { status: In(['active', 'past_due']) },
      relations: { user: true },
      order: { id: 'ASC' },
    });

    for (const membership of live) {
      report.membershipsChecked += 1;
      if (!membership.providerSubscriptionId) continue;
      try {
        const subscription = await this.provider.getSubscription(
          membership.providerSubscriptionId,
        );
        const change = changeToMatch(membership, subscription);
        if (change) await this.apply(membership, change, report, followUps);
      } catch (error) {
        report.errors.push(`${membership.user.username}: ${String(error)}`);
      }
    }
  }

  /** Ends past-due memberships whose grace period is over, and their subscriptions. */
  private async endGrace(
    report: ReconcileReport,
    followUps: FollowUp[],
  ): Promise<void> {
    const now = this.clock.now();
    const pastDue = await this.memberships.find({
      where: { status: 'past_due' },
      relations: { user: true },
      order: { id: 'ASC' },
    });

    for (const membership of pastDue) {
      const graceEnd = graceEndsAt(membership);
      if (graceEnd !== null && now.getTime() < graceEnd.getTime()) continue;
      try {
        await this.apply(
          membership,
          { type: 'grace_ended' },
          report,
          followUps,
        );
        if (membership.providerSubscriptionId) {
          await this.provider.endSubscription(
            membership.providerSubscriptionId,
          );
        }
      } catch (error) {
        report.errors.push(`${membership.user.username}: ${String(error)}`);
      }
    }
  }

  /** Closes checkouts that were never paid, and what was waiting on them. */
  private async expireCheckouts(
    report: ReconcileReport,
    followUps: FollowUp[],
  ): Promise<void> {
    const now = this.clock.now();
    const abandoned = await this.payments.find({
      where: {
        status: 'pending',
        createdAt: LessThan(new Date(now.getTime() - ABANDONED_AFTER_MS)),
      },
      order: { id: 'ASC' },
    });

    for (const payment of abandoned) {
      try {
        if (payment.providerCheckoutId) {
          await this.provider.expireCheckout(payment.providerCheckoutId);
        }
        await this.dataSource.transaction(async (manager) => {
          await manager.update(Payment, payment.id, {
            status: 'expired',
            updatedAt: now,
          });
          if (payment.tipId !== null) {
            await this.tips.markExpired(manager, payment.tipId);
          }
        });
        report.checkoutsExpired += 1;

        if (payment.membershipId === null) continue;
        const membership = await this.memberships.findOne({
          where: { id: payment.membershipId },
          relations: { user: true },
        });
        if (membership) {
          await this.apply(
            membership,
            { type: 'checkout_abandoned' },
            report,
            followUps,
          );
        }
      } catch (error) {
        report.errors.push(`payment ${payment.id}: ${String(error)}`);
      }
    }
  }

  private async apply(
    membership: Membership,
    change: MembershipChange,
    report: ReconcileReport,
    followUps: FollowUp[],
  ): Promise<void> {
    const from = membership.status;
    const changed = await this.dataSource.transaction((manager) =>
      this.membershipService.change(manager, membership, change, {
        source: 'reconcile',
        followUps,
      }),
    );
    if (changed) {
      report.membershipsChanged.push({
        username: membership.user.username,
        from,
        to: membership.status,
        reason: reasonOf(change),
      });
    }
  }
}
