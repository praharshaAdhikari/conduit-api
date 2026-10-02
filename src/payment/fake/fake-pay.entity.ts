import { Column, Entity, PrimaryColumn } from 'typeorm';
import type { Recurring } from '../payment-provider';

@Entity('fake_pay_checkouts')
export class FakeCheckout {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column({ type: 'char', length: 36 })
  reference: string;

  @Column({ name: 'amount_cents', unsigned: true })
  amountCents: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column()
  description: string;

  @Column({ name: 'customer_email' })
  customerEmail: string;

  @Column({ type: 'varchar', length: 8, nullable: true })
  recurring: Recurring | null;

  @Column({ name: 'success_url', length: 2048 })
  successUrl: string;

  @Column({ name: 'cancel_url', length: 2048 })
  cancelUrl: string;

  @Column({ type: 'varchar', length: 16 })
  status: 'open' | 'paid' | 'expired';

  @Column({
    name: 'subscription_id',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  subscriptionId: string | null;

  @Column({ name: 'payment_id', type: 'varchar', length: 40, nullable: true })
  paymentId: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

@Entity('fake_pay_subscriptions')
export class FakeSubscription {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column({ type: 'char', length: 36 })
  reference: string;

  @Column({ name: 'amount_cents', unsigned: true })
  amountCents: number;

  @Column({ type: 'varchar', length: 8 })
  recurring: Recurring;

  @Column({ type: 'varchar', length: 16 })
  status: 'active' | 'past_due' | 'ended';

  @Column({ name: 'current_period_end', type: 'datetime', precision: 3 })
  currentPeriodEnd: Date;

  @Column({ name: 'cancel_at_period_end', type: 'boolean' })
  cancelAtPeriodEnd: boolean;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

@Entity('fake_pay_payments')
export class FakePayment {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column({ name: 'amount_cents', unsigned: true })
  amountCents: number;

  @Column({
    name: 'subscription_id',
    type: 'varchar',
    length: 40,
    nullable: true,
  })
  subscriptionId: string | null;

  @Column({
    name: 'refunded_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  refundedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

/** An event as the fake provider sends it; `data` depends on `type`. */
export interface FakeEventPayload {
  id: string;
  type: string;
  created: string;
  data: Record<string, string | number | boolean | null>;
}

@Entity('fake_pay_events')
export class FakeEvent {
  @PrimaryColumn({ type: 'varchar', length: 40 })
  id: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'json' })
  payload: FakeEventPayload;

  @Column({ unsigned: true })
  deliveries: number;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

export const FAKE_PAY_ENTITIES = [
  FakeCheckout,
  FakeSubscription,
  FakePayment,
  FakeEvent,
];
