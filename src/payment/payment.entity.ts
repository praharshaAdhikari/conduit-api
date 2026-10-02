import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import type { ProviderName } from './payment-provider';

export const PAYMENT_KINDS = ['membership', 'tip'] as const;
export type PaymentKind = (typeof PAYMENT_KINDS)[number];

export const PAYMENT_STATUSES = [
  'pending',
  'succeeded',
  'expired',
  'refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

@Entity('payments')
export class Payment {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'char', length: 36 })
  reference: string;

  @Column({ type: 'varchar', length: 16 })
  kind: PaymentKind;

  @Column({ name: 'user_id', type: 'int', unsigned: true, nullable: true })
  userId: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User | null;

  @Column({
    name: 'membership_id',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  membershipId: number | null;

  @Column({ name: 'amount_cents', unsigned: true })
  amountCents: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column()
  description: string;

  @Column({ type: 'varchar', length: 16 })
  status: PaymentStatus;

  @Column({ type: 'varchar', length: 16 })
  provider: ProviderName;

  @Column({
    name: 'provider_checkout_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerCheckoutId: string | null;

  @Column({
    name: 'provider_payment_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerPaymentId: string | null;

  @Column({ name: 'paid_at', type: 'datetime', precision: 3, nullable: true })
  paidAt: Date | null;

  @Column({
    name: 'refunded_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  refundedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}

@Entity('payment_events')
export class PaymentEventRecord {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 16 })
  provider: ProviderName;

  @Column({ name: 'event_id' })
  eventId: string;

  @Column({ type: 'varchar', length: 64 })
  type: string;

  @Column({ type: 'json' })
  payload: unknown;

  @Column()
  outcome: string;

  @Column({ name: 'received_at', type: 'datetime', precision: 3 })
  receivedAt: Date;
}

export interface PaymentView {
  id: number;
  kind: PaymentKind;
  amountCents: number;
  currency: string;
  description: string;
  status: PaymentStatus;
  createdAt: Date;
  paidAt: Date | null;
  refundedAt: Date | null;
}

export function toPaymentView(payment: Payment): PaymentView {
  return {
    id: payment.id,
    kind: payment.kind,
    amountCents: payment.amountCents,
    currency: payment.currency,
    description: payment.description,
    status: payment.status,
    createdAt: payment.createdAt,
    paidAt: payment.paidAt,
    refundedAt: payment.refundedAt,
  };
}
