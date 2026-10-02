import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { ROLES } from '../auth/roles';
import type { Role } from '../auth/roles';
import { PaginationQuery } from '../common/pagination.dto';
import { BLANK } from '../common/validation';
import type {
  ModerationActionName,
  ModerationTargetType,
} from './moderation-action.entity';

export const REASON_MAX = 255;

export class ReasonDto {
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  @MaxLength(REASON_MAX, {
    message: `is too long (maximum is ${REASON_MAX} characters)`,
  })
  reason: string;
}

// Suspending a user and hiding an article take the same body.
export class ModerationRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => ReasonDto)
  moderation: ReasonDto;
}

export class RoleDto {
  @IsIn(ROLES, { message: `must be one of ${ROLES.join(', ')}` })
  role: Role;
}

export class SetRoleRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => RoleDto)
  user: RoleDto;
}

export class AdminUsersQuery extends PaginationQuery {
  @IsOptional()
  @IsString()
  search?: string;
}

export class AdminArticlesQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(['true', 'false'], { message: 'must be true or false' })
  hidden?: 'true' | 'false';
}

export interface AdminUserView {
  username: string;
  email: string;
  role: Role;
  suspended: boolean;
  suspendedAt: Date | null;
  suspendedReason: string | null;
  createdAt: Date;
}

export interface AdminArticleView {
  slug: string;
  title: string;
  author: string;
  createdAt: Date;
  hidden: boolean;
  hiddenAt: Date | null;
  hiddenBy: string | null;
  hiddenReason: string | null;
}

export interface ModerationActionView {
  id: number;
  action: ModerationActionName;
  moderator: string;
  targetType: ModerationTargetType;
  target: string;
  note: string | null;
  createdAt: Date;
}
