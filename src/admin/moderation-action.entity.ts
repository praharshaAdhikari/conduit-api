import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export const MODERATION_ACTIONS = [
  'suspend',
  'unsuspend',
  'hide',
  'unhide',
  'set_role',
  'refund',
] as const;
export type ModerationActionName = (typeof MODERATION_ACTIONS)[number];
export type ModerationTargetType = 'user' | 'article' | 'payment';

@Entity('moderation_actions')
export class ModerationAction {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'moderator_id', unsigned: true })
  moderatorId: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'moderator_id' })
  moderator: User;

  @Column({ type: 'varchar', length: 16 })
  action: ModerationActionName;

  @Column({ name: 'target_type', type: 'varchar', length: 16 })
  targetType: ModerationTargetType;

  @Column({ name: 'target_id', unsigned: true })
  targetId: number;

  @Column({ name: 'target_label' })
  targetLabel: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  note: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
