import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { Role } from '../auth/roles';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column()
  username: string;

  @Column()
  email: string;

  @Column({ name: 'password_hash' })
  passwordHash: string;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  image: string | null;

  @Column({ type: 'varchar', length: 16 })
  role: Role;

  @Column({
    name: 'suspended_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  suspendedAt: Date | null;

  @Column({
    name: 'suspended_reason',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  suspendedReason: string | null;

  @Column({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
