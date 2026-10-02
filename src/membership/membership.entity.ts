import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ProviderName } from '../payment/payment-provider';
import { User } from '../user/user.entity';
import type { MembershipStatus } from './lifecycle';
import type { Plan } from './plans';

@Entity('memberships')
export class Membership {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'user_id', unsigned: true })
  userId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'varchar', length: 16 })
  plan: Plan['id'];

  @Column({ type: 'varchar', length: 16 })
  status: MembershipStatus;

  @Column({ type: 'varchar', length: 16 })
  provider: ProviderName;

  @Column({
    name: 'provider_subscription_id',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  providerSubscriptionId: string | null;

  @Column({
    name: 'current_period_end',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  currentPeriodEnd: Date | null;

  @Column({ name: 'cancel_at_period_end', type: 'boolean' })
  cancelAtPeriodEnd: boolean;

  @Column({
    name: 'started_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  startedAt: Date | null;

  @Column({ name: 'ended_at', type: 'datetime', precision: 3, nullable: true })
  endedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}

export const CHANGE_SOURCES = [
  'member',
  'webhook',
  'reconcile',
  'admin',
] as const;
export type ChangeSource = (typeof CHANGE_SOURCES)[number];

@Entity('membership_events')
export class MembershipEvent {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'membership_id', unsigned: true })
  membershipId: number;

  @Column({ name: 'from_status', type: 'varchar', length: 16, nullable: true })
  fromStatus: MembershipStatus | null;

  @Column({ name: 'to_status', type: 'varchar', length: 16 })
  toStatus: MembershipStatus;

  @Column({ type: 'varchar', length: 32 })
  reason: string;

  @Column({ type: 'varchar', length: 16 })
  source: ChangeSource;

  @Column({ type: 'varchar', length: 255, nullable: true })
  detail: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
