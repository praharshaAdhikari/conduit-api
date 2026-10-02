import { Type } from 'class-transformer';
import { IsDefined, IsIn, IsOptional, ValidateNested } from 'class-validator';
import { PaginationQuery } from '../common/pagination.dto';
import { BLANK } from '../common/validation';
import { MEMBERSHIP_STATUSES } from './lifecycle';
import type { MembershipStatus } from './lifecycle';
import type { ChangeSource } from './membership.entity';
import { PLAN_IDS } from './plans';
import type { Plan } from './plans';

export class CheckoutDto {
  @IsIn(PLAN_IDS, { message: `must be one of ${PLAN_IDS.join(', ')}` })
  plan: Plan['id'];
}

export class CheckoutRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => CheckoutDto)
  membership: CheckoutDto;
}

export class AdminMembershipsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(MEMBERSHIP_STATUSES, {
    message: `must be one of ${MEMBERSHIP_STATUSES.join(', ')}`,
  })
  status?: MembershipStatus;
}

export interface MembershipView {
  plan: Plan['id'];
  status: MembershipStatus;
  /** Whether members-only articles are open to this user right now. */
  hasAccess: boolean;
  currentPeriodEnd: Date | null;
  cancelAtPeriodEnd: boolean;
  /** When a past-due membership stops giving access; null otherwise. */
  graceEndsAt: Date | null;
  startedAt: Date | null;
  endedAt: Date | null;
}

export interface MembershipEventView {
  /** Null for the first event of a membership. */
  from: MembershipStatus | null;
  to: MembershipStatus;
  reason: string;
  source: ChangeSource;
  detail: string | null;
  createdAt: Date;
}

export interface AdminMembershipView extends MembershipView {
  username: string;
  email: string;
}
