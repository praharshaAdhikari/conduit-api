import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Article } from '../article/article.entity';
import { User } from '../user/user.entity';

export const TIP_STATUSES = [
  'pending_verification',
  'pending_payment',
  'paid',
  'expired',
  'refunded',
] as const;
export type TipStatus = (typeof TIP_STATUSES)[number];

@Entity('tips')
export class Tip {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ type: 'char', length: 36 })
  reference: string;

  @Column({ name: 'author_id', unsigned: true })
  authorId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'author_id' })
  author: User;

  @Column({ name: 'article_id', type: 'int', unsigned: true, nullable: true })
  articleId: number | null;

  @ManyToOne(() => Article)
  @JoinColumn({ name: 'article_id' })
  article: Article | null;

  @Column({
    name: 'tipper_user_id',
    type: 'int',
    unsigned: true,
    nullable: true,
  })
  tipperUserId: number | null;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'tipper_user_id' })
  tipperUser: User | null;

  @Column({ name: 'tipper_email' })
  tipperEmail: string;

  @Column({ name: 'tipper_name', type: 'varchar', length: 64, nullable: true })
  tipperName: string | null;

  @Column({ type: 'varchar', length: 280, nullable: true })
  message: string | null;

  @Column({ name: 'amount_cents', unsigned: true })
  amountCents: number;

  @Column({ type: 'char', length: 3 })
  currency: string;

  @Column({ type: 'varchar', length: 24 })
  status: TipStatus;

  @Column({ name: 'paid_at', type: 'datetime', precision: 3, nullable: true })
  paidAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}

@Entity('email_verifications')
export class EmailVerification {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'tip_id', unsigned: true })
  tipId: number;

  @Column()
  email: string;

  @Column({ name: 'code_hash', type: 'char', length: 64 })
  codeHash: string;

  @Column({ unsigned: true })
  attempts: number;

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt: Date;

  @Column({ name: 'used_at', type: 'datetime', precision: 3, nullable: true })
  usedAt: Date | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
