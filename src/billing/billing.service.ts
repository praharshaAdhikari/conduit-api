import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import { AdminService } from '../admin/admin.service';
import { invalid, notFound } from '../common/api-error';
import { isDuplicateKey } from '../common/db-errors';
import { Clock } from '../common/clock';
import { isLive } from '../membership/lifecycle';
import type { MembershipChange } from '../membership/lifecycle';
import { Membership } from '../membership/membership.entity';
import type { ChangeSource } from '../membership/membership.entity';
import { MembershipService } from '../membership/membership.service';
import type { FollowUp } from '../membership/membership.service';
import { planById } from '../membership/plans';
import { PAYMENT_PROVIDER } from '../payment/payment-provider';
import type {
  PaymentEvent,
  PaymentProvider,
  WebhookHeaders,
} from '../payment/payment-provider';
import {
  Payment,
  PaymentEventRecord,
  toPaymentView,
} from '../payment/payment.entity';
import { TipService } from '../tip/tip.service';
import { User } from '../user/user.entity';
import { AdminPaymentsQuery, AdminPaymentView } from './billing.dto';

type EventOf<T extends PaymentEvent['type']> = Extract<
  PaymentEvent,
  { type: T }
>;

// What an event did, kept with the event. "ignored" is a normal result: the
// provider is told the event was received either way, so it stops resending.
const applied = 'applied';
const ignored = (why: string) => `ignored: ${why}`;

/** Turns what the payment provider reports into payments and membership changes. */
@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);

  constructor(
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly memberships: MembershipService,
    private readonly tips: TipService,
    private readonly admin: AdminService,
    private readonly dataSource: DataSource,
    private readonly clock: Clock,
  ) {}

  /** Handles a webhook request: checks its signature, then applies the event once. */
  async receive(rawBody: Buffer | undefined, headers: WebhookHeaders) {
    return this.process(await this.provider.parseWebhook(rawBody, headers));
  }

  /**
   * Applies an event, unless this event was applied before. The event is
   * recorded in the same transaction as its effects, so either both are saved
   * or neither is and the provider's next delivery starts again from nothing.
   */
  async process(
    event: PaymentEvent,
  ): Promise<{ duplicate: boolean; outcome?: string }> {
    // Emails wait until the changes are saved: an email cannot be rolled back.
    const followUps: FollowUp[] = [];
    try {
      const outcome = await this.dataSource.transaction(async (manager) => {
        await manager.insert(PaymentEventRecord, {
          provider: this.provider.name,
          eventId: event.id,
          type: event.name,
          payload: event,
          outcome: 'processing',
          receivedAt: this.clock.now(),
        });
        const result = await this.apply(manager, event, followUps);
        await manager.update(
          PaymentEventRecord,
          { provider: this.provider.name, eventId: event.id },
          { outcome: result },
        );
        return result;
      });
      await this.runFollowUps(followUps);
      return { duplicate: false, outcome };
    } catch (error) {
      if (isDuplicateKey(error)) return { duplicate: true };
      throw error;
    }
  }

  async adminListPayments({ kind, status, limit, offset }: AdminPaymentsQuery) {
    const [rows, paymentsCount] = await this.payments.findAndCount({
      where: { ...(kind ? { kind } : {}), ...(status ? { status } : {}) },
      relations: { user: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { payments: rows.map(toAdminView), paymentsCount };
  }

  /** Gives the money back. A refund of the payment a membership is running on ends the membership. */
  async refund(paymentId: number, actor: User): Promise<AdminPaymentView> {
    const payment = Number.isInteger(paymentId)
      ? await this.payments.findOne({
          where: { id: paymentId },
          relations: { user: true },
        })
      : null;
    if (!payment) throw notFound('payment');
    if (payment.status === 'refunded') {
      throw invalid({ payment: ['is already refunded'] });
    }
    if (payment.status !== 'succeeded' || !payment.providerPaymentId) {
      throw invalid({ payment: ['was not paid'] });
    }

    // The provider is asked first: if it refuses, nothing here has changed.
    await this.provider.refund(payment.providerPaymentId);

    const followUps: FollowUp[] = [];
    const endedSubscription = await this.dataSource.transaction(
      async (manager) => {
        const subscriptionId = await this.markRefunded(
          manager,
          payment,
          'admin',
          followUps,
        );
        await this.admin.record(manager, actor, 'refund', {
          type: 'payment',
          id: payment.id,
          label: `#${payment.id}`,
          note: payment.description,
        });
        return subscriptionId;
      },
    );
    if (endedSubscription) {
      await this.provider.endSubscription(endedSubscription);
    }
    await this.runFollowUps(followUps);
    return toAdminView(payment);
  }

  private apply(
    manager: EntityManager,
    event: PaymentEvent,
    followUps: FollowUp[],
  ): Promise<string> {
    switch (event.type) {
      case 'checkout.completed':
        return this.checkoutCompleted(manager, event, followUps);
      case 'checkout.expired':
        return this.checkoutExpired(manager, event);
      case 'subscription.renewed':
        return this.subscriptionRenewed(manager, event, followUps);
      case 'subscription.payment_failed':
        return this.subscriptionChanged(
          manager,
          event.subscriptionId,
          { type: 'payment_failed' },
          followUps,
        );
      case 'subscription.updated':
        return this.subscriptionChanged(
          manager,
          event.subscriptionId,
          {
            type: 'cancel_at_period_end',
            value: event.cancelAtPeriodEnd,
            periodEnd: event.periodEnd,
          },
          followUps,
        );
      case 'subscription.ended':
        return this.subscriptionChanged(
          manager,
          event.subscriptionId,
          { type: 'ended' },
          followUps,
        );
      case 'payment.refunded':
        return this.paymentRefunded(manager, event, followUps);
      case 'ignored':
        return Promise.resolve(ignored('not an event this API uses'));
    }
  }

  private async checkoutCompleted(
    manager: EntityManager,
    event: EventOf<'checkout.completed'>,
    followUps: FollowUp[],
  ): Promise<string> {
    // Locked, so two events about one payment are applied one after the other.
    const payment = await manager.findOne(Payment, {
      where: { reference: event.reference },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) return ignored('no payment has this reference');
    if (payment.status !== 'pending') {
      return ignored(`the payment is ${payment.status}`);
    }

    const now = this.clock.now();
    await manager.update(Payment, payment.id, {
      status: 'succeeded',
      providerPaymentId: event.paymentId,
      paidAt: now,
      updatedAt: now,
    });

    if (payment.kind === 'membership' && payment.membershipId !== null) {
      const membership = await manager.findOneByOrFail(Membership, {
        id: payment.membershipId,
      });
      await this.memberships.change(
        manager,
        membership,
        { type: 'paid', periodEnd: event.periodEnd },
        { source: 'webhook', subscriptionId: event.subscriptionId, followUps },
      );
    }
    if (payment.kind === 'tip' && payment.tipId !== null) {
      const { tipId } = payment;
      await this.tips.markPaid(manager, tipId);
      followUps.push(() => this.tips.sendReceipts(tipId));
    }
    return applied;
  }

  private async checkoutExpired(
    manager: EntityManager,
    event: EventOf<'checkout.expired'>,
  ): Promise<string> {
    const payment = await manager.findOne(Payment, {
      where: { reference: event.reference, status: 'pending' },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) return ignored('no open payment');

    await manager.update(Payment, payment.id, {
      status: 'expired',
      updatedAt: this.clock.now(),
    });
    if (payment.tipId !== null) {
      await this.tips.markExpired(manager, payment.tipId);
    }
    return applied;
  }

  private async subscriptionRenewed(
    manager: EntityManager,
    event: EventOf<'subscription.renewed'>,
    followUps: FollowUp[],
  ): Promise<string> {
    const membership = await this.findBySubscription(
      manager,
      event.subscriptionId,
    );
    if (!membership) return ignored('no membership has this subscription');

    const now = this.clock.now();
    const plan = planById(membership.plan);
    await manager.insert(Payment, {
      reference: randomUUID(),
      kind: 'membership',
      userId: membership.userId,
      membershipId: membership.id,
      tipId: null,
      amountCents: event.amountCents,
      currency: plan?.currency ?? 'usd',
      description: `Conduit membership renewal (${membership.plan})`,
      status: 'succeeded',
      provider: this.provider.name,
      providerCheckoutId: null,
      providerPaymentId: event.paymentId,
      paidAt: now,
      refundedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await this.memberships.change(
      manager,
      membership,
      { type: 'paid', periodEnd: event.periodEnd },
      { source: 'webhook', followUps },
    );
    return applied;
  }

  private async subscriptionChanged(
    manager: EntityManager,
    subscriptionId: string,
    change: MembershipChange,
    followUps: FollowUp[],
  ): Promise<string> {
    const membership = await this.findBySubscription(manager, subscriptionId);
    if (!membership) return ignored('no membership has this subscription');

    const changed = await this.memberships.change(manager, membership, change, {
      source: 'webhook',
      followUps,
    });
    return changed
      ? applied
      : ignored(`changes nothing on a ${membership.status} membership`);
  }

  private async paymentRefunded(
    manager: EntityManager,
    event: EventOf<'payment.refunded'>,
    followUps: FollowUp[],
  ): Promise<string> {
    const payment = await manager.findOne(Payment, {
      where: {
        provider: this.provider.name,
        providerPaymentId: event.paymentId,
      },
      lock: { mode: 'pessimistic_write' },
    });
    if (!payment) return ignored('no payment has this provider id');
    if (payment.status === 'refunded') return ignored('already refunded');
    await this.markRefunded(manager, payment, 'webhook', followUps);
    return applied;
  }

  /**
   * Marks the payment refunded. If it is the payment the membership is
   * running on, the membership ends; the id of the subscription to end at the
   * provider is returned.
   */
  private async markRefunded(
    manager: EntityManager,
    payment: Payment,
    source: ChangeSource,
    followUps: FollowUp[],
  ): Promise<string | null> {
    const now = this.clock.now();
    payment.status = 'refunded';
    payment.refundedAt = now;
    await manager.update(Payment, payment.id, {
      status: 'refunded',
      refundedAt: now,
      updatedAt: now,
    });
    if (payment.tipId !== null) {
      await this.tips.markRefunded(manager, payment.tipId);
    }
    if (payment.kind !== 'membership' || payment.membershipId === null) {
      return null;
    }

    const latest = await manager.findOne(Payment, {
      where: {
        membershipId: payment.membershipId,
        status: In(['succeeded', 'refunded']),
      },
      order: { paidAt: 'DESC', id: 'DESC' },
    });
    const membership = await manager.findOneBy(Membership, {
      id: payment.membershipId,
    });
    if (
      !membership ||
      latest?.id !== payment.id ||
      !isLive(membership.status)
    ) {
      return null;
    }
    await this.memberships.change(
      manager,
      membership,
      { type: 'refunded' },
      { source, followUps },
    );
    return membership.providerSubscriptionId;
  }

  private async runFollowUps(followUps: FollowUp[]): Promise<void> {
    for (const followUp of followUps) {
      await followUp().catch((error) => this.logger.warn(String(error)));
    }
  }

  private findBySubscription(
    manager: EntityManager,
    subscriptionId: string,
  ): Promise<Membership | null> {
    return manager.findOne(Membership, {
      where: {
        provider: this.provider.name,
        providerSubscriptionId: subscriptionId,
      },
      lock: { mode: 'pessimistic_write' },
    });
  }
}

function toAdminView(payment: Payment): AdminPaymentView {
  return {
    ...toPaymentView(payment),
    username: payment.user?.username ?? null,
    provider: payment.provider,
  };
}
