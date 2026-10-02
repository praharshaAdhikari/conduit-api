import { IsIn, IsOptional } from 'class-validator';
import { PaginationQuery } from '../common/pagination.dto';
import { PAYMENT_KINDS, PAYMENT_STATUSES } from '../payment/payment.entity';
import type {
  PaymentKind,
  PaymentStatus,
  PaymentView,
} from '../payment/payment.entity';

export class AdminPaymentsQuery extends PaginationQuery {
  @IsOptional()
  @IsIn(PAYMENT_KINDS, {
    message: `must be one of ${PAYMENT_KINDS.join(', ')}`,
  })
  kind?: PaymentKind;

  @IsOptional()
  @IsIn(PAYMENT_STATUSES, {
    message: `must be one of ${PAYMENT_STATUSES.join(', ')}`,
  })
  status?: PaymentStatus;
}

export interface AdminPaymentView extends PaymentView {
  /** Who paid; null for a guest or a deleted account. */
  username: string | null;
  provider: string;
}
