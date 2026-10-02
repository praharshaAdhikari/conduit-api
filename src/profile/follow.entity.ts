import { Column, Entity, PrimaryColumn } from 'typeorm';

@Entity('follows')
export class Follow {
  @PrimaryColumn({ name: 'follower_id', unsigned: true })
  followerId: number;

  @PrimaryColumn({ name: 'followed_id', unsigned: true })
  followedId: number;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
