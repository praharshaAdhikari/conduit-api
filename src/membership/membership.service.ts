import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { invalid, notFound } from '../common/api-error';
import { Clock } from '../common/clock';
import { formatMoney } from '../common/money';
import { PaginationQuery } from '../common/pagination.dto';
import { paymentSettings } from '../config/env';
import { MailService } from '../mail/mail.service';
import { PAYMENT_PROVIDER } from '../payment/payment-provider';
import type { PaymentProvider } from '../payment/payment-provider';
import { Payment, toPaymentView } from '../payment/payment.entity';
import { User } from '../user/user.entity';
import {
  applyChange,
  graceEndsAt,
  hasAccess,
  isLive,
  MembershipChange,
  MembershipState,
  reasonOf,
} from './lifecycle';
import {
  AdminMembershipsQuery,
  AdminMembershipView,
  MembershipEventView,
  MembershipView,
} from './membership.dto';
import { ChangeSource, Membership, MembershipEvent } from './membership.entity';
import { planById } from './plans';
import type { Plan } from './plans';

/** Work to do once a change is saved, such as sending an email. */
export type FollowUp = () => Promise<void>;

export interface ChangeOptions {
  source: ChangeSource;
  /** Set when a checkout is paid: the subscription the membership now runs on. */
  subscriptionId?: string | null;
  /** Emails about the change are added here, to be sent after the transaction. */
  followUps?: FollowUp[];
}

type Notice = 'started' | 'payment_failed' | 'cancel_requested' | 'ended';

const dateText = (date: Date | null) =>
  date ? date.toISOString().slice(0, 10) : 'the end of the paid period';

export function toMembershipView(
  membership: Membership,
  now: Date,
): MembershipView {
  return {
    plan: membership.plan,
    status: membership.status,
    hasAccess: hasAccess(membership, now),
    currentPeriodEnd: membership.currentPeriodEnd,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    graceEndsAt: graceEndsAt(membership),
    startedAt: membership.startedAt,
    endedAt: membership.endedAt,
  };
}

/** Which email, if any, a change from `before` to `after` calls for. */
export function noticeFor(
  before: MembershipState,
  after: MembershipState,
): Notice | null {
  if (!isLive(before.status) && after.status === 'active') return 'started';
  if (before.status === 'active' && after.status === 'past_due') {
    return 'payment_failed';
  }
  if (isLive(before.status) && !isLive(after.status)) return 'ended';
  if (!before.cancelAtPeriodEnd && after.cancelAtPeriodEnd) {
    return 'cancel_requested';
  }
  return null;
}

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(MembershipEvent)
    private readonly events: Repository<MembershipEvent>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @InjectRepository(User) private readonly users: Repository<User>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly mail: MailService,
    private readonly clock: Clock,
  ) {}

  /** The user's membership, or null if they never started one. */
  async get(userId: number): Promise<MembershipView | null> {
    const membership = await this.memberships.findOneBy({ userId });
    return membership ? toMembershipView(membership, this.clock.now()) : null;
  }

  async hasAccess(userId?: number): Promise<boolean> {
    if (userId === undefined) return false;
    const membership = await this.memberships.findOneBy({ userId });
    return membership !== null && hasAccess(membership, this.clock.now());
  }

  /** Which of these users are members right now. */
  async membersAmong(userIds: number[]): Promise<Set<number>> {
    if (userIds.length === 0) return new Set();
    const now = this.clock.now();
    const rows = await this.memberships.findBy({ userId: In(userIds) });
    return new Set(
      rows.filter((row) => hasAccess(row, now)).map((row) => row.userId),
    );
  }

  /** Starts a checkout at the payment provider and returns where to send the user. */
  async startCheckout(
    user: User,
    planId: Plan['id'],
  ): Promise<{ checkoutUrl: string; checkoutId: string }> {
    const plan = planById(planId)!;
    const existing = await this.memberships.findOneBy({ userId: user.id });
    // A subscription is still running at the provider, even if a past-due
    // member has run out of grace; a second one would charge them twice.
    if (existing?.status === 'active') {
      throw invalid({ membership: ['is already active'] });
    }
    if (existing?.status === 'past_due') {
      throw invalid({ membership: ['has a payment outstanding'] });
    }
    // Only one checkout can be open, so a membership cannot be paid for twice.
    if (existing) await this.expireOpenCheckouts(existing.id);

    const now = this.clock.now();
    const membership =
      existing ??
      (await this.memberships.save(
        this.memberships.create({
          userId: user.id,
          plan: plan.id,
          status: 'lapsed',
          provider: this.provider.name,
          providerSubscriptionId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          startedAt: null,
          endedAt: null,
          createdAt: now,
          updatedAt: now,
        }),
      ));
    await this.memberships.update(membership.id, {
      plan: plan.id,
      provider: this.provider.name,
    });
    await this.change(
      this.memberships.manager,
      membership,
      { type: 'checkout_started' },
      { source: 'member', isNew: existing === null },
    );

    const payment = await this.payments.save(
      this.payments.create({
        reference: randomUUID(),
        kind: 'membership',
        userId: user.id,
        membershipId: membership.id,
        tipId: null,
        amountCents: plan.amountCents,
        currency: plan.currency,
        description: `Conduit membership (${plan.name.toLowerCase()})`,
        status: 'pending',
        provider: this.provider.name,
        providerCheckoutId: null,
        providerPaymentId: null,
        paidAt: null,
        refundedAt: null,
        createdAt: now,
        updatedAt: now,
      }),
    );

    const { webUrl } = paymentSettings();
    try {
      const checkout = await this.provider.createCheckout({
        reference: payment.reference,
        amountCents: payment.amountCents,
        currency: payment.currency,
        description: payment.description,
        customerEmail: user.email,
        recurring: plan.interval,
        successUrl: `${webUrl}/membership/success`,
        cancelUrl: `${webUrl}/membership/cancelled`,
      });
      await this.payments.update(payment.id, {
        providerCheckoutId: checkout.id,
      });
      return { checkoutUrl: checkout.url, checkoutId: checkout.id };
    } catch (error) {
      await this.payments.update(payment.id, { status: 'expired' });
      throw error;
    }
  }

  /** The membership stops at the end of the period that is already paid for. */
  async cancel(userId: number): Promise<MembershipView> {
    return this.setCancelAtPeriodEnd(userId, true);
  }

  /** Takes a cancellation back before the period ends. */
  async resume(userId: number): Promise<MembershipView> {
    return this.setCancelAtPeriodEnd(userId, false);
  }

  /** The user's own payments, newest first. */
  async listPayments(userId: number, { limit, offset }: PaginationQuery) {
    const [rows, paymentsCount] = await this.payments.findAndCount({
      where: { userId },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    return { payments: rows.map(toPaymentView), paymentsCount };
  }

  /** What happened to the user's membership, newest first. */
  async history(userId: number, { limit, offset }: PaginationQuery) {
    const membership = await this.memberships.findOneBy({ userId });
    if (!membership) return { events: [], eventsCount: 0 };

    const [rows, eventsCount] = await this.events.findAndCount({
      where: { membershipId: membership.id },
      order: { createdAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    const events = rows.map((row): MembershipEventView => ({
      from: row.fromStatus,
      to: row.toStatus,
      reason: row.reason,
      source: row.source,
      detail: row.detail,
      createdAt: row.createdAt,
    }));
    return { events, eventsCount };
  }

  /** The same history, for a moderator looking at someone else's membership. */
  async adminHistory(username: string, query: PaginationQuery) {
    const user = await this.users.findOneBy({ username });
    if (!user) throw notFound('user');
    return this.history(user.id, query);
  }

  async adminList({ status, limit, offset }: AdminMembershipsQuery) {
    const now = this.clock.now();
    const [rows, membershipsCount] = await this.memberships.findAndCount({
      where: status ? { status } : {},
      relations: { user: true },
      order: { updatedAt: 'DESC', id: 'DESC' },
      take: limit,
      skip: offset,
    });
    const memberships = rows.map((row): AdminMembershipView => ({
      username: row.user.username,
      email: row.user.email,
      ...toMembershipView(row, now),
    }));
    return { memberships, membershipsCount };
  }

  /**
   * Applies a change to a membership inside the caller's transaction, records
   * it in the membership's history, and returns whether anything changed.
   */
  async change(
    manager: EntityManager,
    membership: Membership,
    change: MembershipChange,
    options: ChangeOptions & { isNew?: boolean },
  ): Promise<boolean> {
    const now = this.clock.now();
    const before: MembershipState = {
      status: membership.status,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      currentPeriodEnd: membership.currentPeriodEnd,
      startedAt: membership.startedAt,
      endedAt: membership.endedAt,
    };
    const after = applyChange(before, change, now);
    const changed =
      after.status !== before.status ||
      after.cancelAtPeriodEnd !== before.cancelAtPeriodEnd ||
      after.currentPeriodEnd?.getTime() !== before.currentPeriodEnd?.getTime();
    if (!changed && options.subscriptionId === undefined) return false;

    Object.assign(membership, after, { updatedAt: now });
    if (options.subscriptionId !== undefined) {
      membership.providerSubscriptionId = options.subscriptionId;
    }
    await manager.update(Membership, membership.id, {
      status: membership.status,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      currentPeriodEnd: membership.currentPeriodEnd,
      startedAt: membership.startedAt,
      endedAt: membership.endedAt,
      providerSubscriptionId: membership.providerSubscriptionId,
      updatedAt: now,
    });
    if (!changed) return false;

    await manager.insert(MembershipEvent, {
      membershipId: membership.id,
      fromStatus: options.isNew ? null : before.status,
      toStatus: after.status,
      reason: reasonOf(change),
      source: options.source,
      detail:
        isLive(after.status) && after.currentPeriodEnd
          ? `paid until ${dateText(after.currentPeriodEnd)}`
          : null,
      createdAt: now,
    });

    const notice = noticeFor(before, after);
    if (notice) {
      const { id } = membership;
      options.followUps?.push(() => this.sendNotice(id, notice));
    }
    return true;
  }

  private async setCancelAtPeriodEnd(
    userId: number,
    value: boolean,
  ): Promise<MembershipView> {
    const membership = await this.memberships.findOneBy({ userId });
    if (
      !membership ||
      membership.status !== 'active' ||
      !membership.providerSubscriptionId
    ) {
      throw invalid({ membership: ['is not active'] });
    }
    if (membership.cancelAtPeriodEnd === value) {
      throw invalid({
        membership: [value ? 'is already set to end' : 'is not set to end'],
      });
    }

    await this.provider.setCancelAtPeriodEnd(
      membership.providerSubscriptionId,
      value,
    );
    // The provider's webhook will say the same; applying it now means the
    // user sees the change at once.
    const followUps: FollowUp[] = [];
    await this.change(
      this.memberships.manager,
      membership,
      { type: 'cancel_at_period_end', value },
      { source: 'member', followUps },
    );
    for (const followUp of followUps) await followUp();
    return toMembershipView(membership, this.clock.now());
  }

  private async expireOpenCheckouts(membershipId: number): Promise<void> {
    const open = await this.payments.findBy({
      membershipId,
      status: 'pending',
    });
    for (const payment of open) {
      if (payment.providerCheckoutId) {
        await this.provider.expireCheckout(payment.providerCheckoutId);
      }
      await this.payments.update(payment.id, {
        status: 'expired',
        updatedAt: this.clock.now(),
      });
    }
  }

  private async sendNotice(
    membershipId: number,
    notice: Notice,
  ): Promise<void> {
    const membership = await this.memberships.findOne({
      where: { id: membershipId },
      relations: { user: true },
    });
    if (!membership) return;
    const plan = planById(membership.plan);
    const price = plan
      ? `${formatMoney(plan.amountCents, plan.currency)} a ${plan.interval}`
      : '';
    const until = dateText(membership.currentPeriodEnd);
    const grace = dateText(graceEndsAt(membership));

    const messages: Record<Notice, { subject: string; text: string }> = {
      started: {
        subject: 'Your Conduit membership has started',
        text: `Thank you for joining. Your ${membership.plan} membership (${price}) is paid until ${until}.`,
      },
      payment_failed: {
        subject: 'Your membership payment failed',
        text: `We could not take the payment for your membership. You keep your access until ${grace}; after that the membership ends.`,
      },
      cancel_requested: {
        subject: 'Your membership is set to end',
        text: `As you asked, your membership will end on ${until}. You keep your access until then, and you can change your mind before that date.`,
      },
      ended: {
        subject: 'Your membership has ended',
        text: 'Your Conduit membership has ended. You can join again whenever you like.',
      },
    };
    await this.mail.sendQuietly({
      to: membership.user.email,
      ...messages[notice],
    });
  }
}
