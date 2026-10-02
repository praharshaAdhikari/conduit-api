import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, In, Repository } from 'typeorm';
import { invalid } from '../common/api-error';
import { PaginationQuery } from '../common/pagination.dto';
import { paymentSettings } from '../config/env';
import { PAYMENT_PROVIDER } from '../payment/payment-provider';
import type { PaymentProvider } from '../payment/payment-provider';
import { Payment, toPaymentView } from '../payment/payment.entity';
import { User } from '../user/user.entity';
import {
  applyChange,
  hasAccess,
  MembershipChange,
  MembershipState,
} from './lifecycle';
import {
  AdminMembershipsQuery,
  AdminMembershipView,
  MembershipView,
} from './membership.dto';
import { Membership } from './membership.entity';
import { planById } from './plans';
import type { Plan } from './plans';

export function toMembershipView(membership: Membership): MembershipView {
  return {
    plan: membership.plan,
    status: membership.status,
    hasAccess: hasAccess(membership.status),
    currentPeriodEnd: membership.currentPeriodEnd,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
    startedAt: membership.startedAt,
    endedAt: membership.endedAt,
  };
}

@Injectable()
export class MembershipService {
  constructor(
    @InjectRepository(Membership)
    private readonly memberships: Repository<Membership>,
    @InjectRepository(Payment) private readonly payments: Repository<Payment>,
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
  ) {}

  /** The user's membership, or null if they never started one. */
  async get(userId: number): Promise<MembershipView | null> {
    const membership = await this.memberships.findOneBy({ userId });
    return membership ? toMembershipView(membership) : null;
  }

  async hasAccess(userId?: number): Promise<boolean> {
    if (userId === undefined) return false;
    const membership = await this.memberships.findOneBy({ userId });
    return membership !== null && hasAccess(membership.status);
  }

  /** Which of these users are members right now. */
  async membersAmong(userIds: number[]): Promise<Set<number>> {
    if (userIds.length === 0) return new Set();
    const rows = await this.memberships.findBy({ userId: In(userIds) });
    return new Set(
      rows.filter((row) => hasAccess(row.status)).map((row) => row.userId),
    );
  }

  /** Starts a checkout at the payment provider and returns where to send the user. */
  async startCheckout(
    user: User,
    planId: Plan['id'],
  ): Promise<{ checkoutUrl: string; checkoutId: string }> {
    const plan = planById(planId)!;
    const existing = await this.memberships.findOneBy({ userId: user.id });
    if (existing && hasAccess(existing.status)) {
      throw invalid({ membership: ['is already active'] });
    }
    // Only one checkout can be open, so a membership cannot be paid for twice.
    if (existing) await this.expireOpenCheckouts(existing.id);

    const now = new Date();
    const membership = await this.memberships.save(
      this.memberships.create({
        ...(existing ?? {
          userId: user.id,
          providerSubscriptionId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          startedAt: null,
          endedAt: null,
          createdAt: now,
        }),
        plan: plan.id,
        status: 'pending',
        provider: this.provider.name,
        updatedAt: now,
      }),
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

  async adminList({ status, limit, offset }: AdminMembershipsQuery) {
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
      ...toMembershipView(row),
    }));
    return { memberships, membershipsCount };
  }

  /**
   * Applies a change to a membership inside the caller's transaction and
   * returns it as it now is. `subscriptionId` is set when a checkout is paid.
   */
  async change(
    manager: EntityManager,
    membership: Membership,
    change: MembershipChange,
    subscriptionId?: string | null,
  ): Promise<Membership> {
    const next: MembershipState = applyChange(membership, change, new Date());
    Object.assign(membership, next, { updatedAt: new Date() });
    if (subscriptionId !== undefined) {
      membership.providerSubscriptionId = subscriptionId;
    }
    await manager.update(Membership, membership.id, {
      status: membership.status,
      cancelAtPeriodEnd: membership.cancelAtPeriodEnd,
      currentPeriodEnd: membership.currentPeriodEnd,
      startedAt: membership.startedAt,
      endedAt: membership.endedAt,
      providerSubscriptionId: membership.providerSubscriptionId,
      updatedAt: membership.updatedAt,
    });
    return membership;
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
    await this.change(this.memberships.manager, membership, {
      type: 'cancel_at_period_end',
      value,
    });
    return toMembershipView(membership);
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
        updatedAt: new Date(),
      });
    }
  }
}
