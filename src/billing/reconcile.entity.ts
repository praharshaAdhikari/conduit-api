import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export const RECONCILE_STARTERS = ['schedule', 'command', 'admin'] as const;
export type ReconcileStarter = (typeof RECONCILE_STARTERS)[number];

export interface ReconcileChange {
  username: string;
  from: string;
  to: string;
  reason: string;
}

export interface ReconcileReport {
  /** Memberships with a running subscription, each compared with the provider. */
  membershipsChecked: number;
  membershipsChanged: ReconcileChange[];
  /** Checkouts nobody paid within a day. */
  checkoutsExpired: number;
  /** Guest tips whose email address was never confirmed within a day. */
  tipsExpired: number;
  /** What could not be checked or changed; the run carries on past these. */
  errors: string[];
}

@Entity('reconcile_runs')
export class ReconcileRun {
  @PrimaryGeneratedColumn({ unsigned: true })
  id: number;

  @Column({ name: 'started_by', type: 'varchar', length: 16 })
  startedBy: ReconcileStarter;

  @Column({ name: 'started_at', type: 'datetime', precision: 3 })
  startedAt: Date;

  @Column({
    name: 'finished_at',
    type: 'datetime',
    precision: 3,
    nullable: true,
  })
  finishedAt: Date | null;

  @Column({ type: 'json', nullable: true })
  report: ReconcileReport | null;
}

export interface ReconcileRunView extends ReconcileReport {
  id: number;
  startedBy: ReconcileStarter;
  startedAt: Date;
  /** Null for a run that is in progress or was cut off; its counts are then all zero. */
  finishedAt: Date | null;
}

const NOTHING_YET: ReconcileReport = {
  membershipsChecked: 0,
  membershipsChanged: [],
  checkoutsExpired: 0,
  tipsExpired: 0,
  errors: [],
};

export function toRunView(run: ReconcileRun): ReconcileRunView {
  return {
    id: run.id,
    startedBy: run.startedBy,
    startedAt: run.startedAt,
    finishedAt: run.finishedAt,
    ...(run.report ?? NOTHING_YET),
  };
}
