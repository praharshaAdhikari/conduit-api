import { Type } from 'class-transformer';
import {
  IsDefined,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { PaginationQuery } from '../common/pagination.dto';
import { BLANK } from '../common/validation';
import { TIP_STATUSES } from './tip.entity';
import type { TipStatus } from './tip.entity';

export const TIP_MIN_CENTS = 100;
export const TIP_MAX_CENTS = 50_000;
export const TIP_NAME_MAX = 64;
export const TIP_MESSAGE_MAX = 280;

const tooLong = (max: number) => `is too long (maximum is ${max} characters)`;

export class CreateTipDto {
  /** Username of the author the tip is for. */
  @IsString({ message: BLANK })
  @IsNotEmpty({ message: BLANK })
  author: string;

  /** Slug of the article the tip was left on, if any. */
  @IsOptional()
  @IsString({ message: 'must be text' })
  article?: string;

  @IsInt({ message: 'must be a whole number of cents' })
  @Min(TIP_MIN_CENTS, { message: `must be at least ${TIP_MIN_CENTS}` })
  @Max(TIP_MAX_CENTS, { message: `must be at most ${TIP_MAX_CENTS}` })
  amountCents: number;

  @IsOptional()
  @IsString({ message: 'must be text' })
  @MaxLength(TIP_NAME_MAX, { message: tooLong(TIP_NAME_MAX) })
  name?: string;

  @IsOptional()
  @IsString({ message: 'must be text' })
  @MaxLength(TIP_MESSAGE_MAX, { message: tooLong(TIP_MESSAGE_MAX) })
  message?: string;

  /** Needed from a guest; a logged-in user's own address is used instead. */
  @IsOptional()
  @IsEmail({}, { message: 'is invalid' })
  @MaxLength(255, { message: tooLong(255) })
  email?: string;
}

export class CreateTipRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => CreateTipDto)
  tip: CreateTipDto;
}

export class VerifyDto {
  @IsString({ message: BLANK })
  @Matches(/^\d{6}$/, { message: 'must be 6 digits' })
  code: string;
}

export class VerifyRequest {
  @IsDefined({ message: BLANK })
  @ValidateNested()
  @Type(() => VerifyDto)
  verification: VerifyDto;
}

export const TIP_DIRECTIONS = ['received', 'sent'] as const;
export type TipDirection = (typeof TIP_DIRECTIONS)[number];

export class UserTipsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(TIP_DIRECTIONS, {
    message: `must be one of ${TIP_DIRECTIONS.join(', ')}`,
  })
  direction: TipDirection = 'received';
}

export class AdminTipsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(TIP_STATUSES, {
    message: `must be one of ${TIP_STATUSES.join(', ')}`,
  })
  status?: TipStatus;
}

// What anyone holding the tip's reference may see. It leaves out the
// tipper's email address on purpose.
export interface TipView {
  reference: string;
  status: TipStatus;
  amountCents: number;
  currency: string;
  /** Username of the author. */
  author: string;
  /** Slug of the article, if the tip was left on one that still exists. */
  article: string | null;
  name: string | null;
  message: string | null;
  createdAt: Date;
  paidAt: Date | null;
}

export interface AdminTipView extends TipView {
  tipperEmail: string;
  tipperUsername: string | null;
}
