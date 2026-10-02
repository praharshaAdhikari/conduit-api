import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { PaginationQuery } from '../common/pagination.dto';
import { AdminMembershipsQuery } from '../membership/membership.dto';
import { MembershipService } from '../membership/membership.service';
import { User } from '../user/user.entity';
import { AdminPaymentsQuery } from './billing.dto';
import { BillingService } from './billing.service';
import { ReconcileService } from './reconcile.service';

// Moderators can look; only an admin can give money back or run the reconcile job.
@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('moderator')
@ApiBearerAuth()
export class AdminBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly memberships: MembershipService,
    private readonly reconciler: ReconcileService,
  ) {}

  @Get('memberships')
  listMemberships(@Query() query: AdminMembershipsQuery) {
    return this.memberships.adminList(query);
  }

  @Post('memberships/reconcile')
  @HttpCode(200)
  @Roles('admin')
  async reconcile() {
    return { run: await this.reconciler.run('admin') };
  }

  @Get('memberships/:username/history')
  history(
    @Param('username') username: string,
    @Query() query: PaginationQuery,
  ) {
    return this.memberships.adminHistory(username, query);
  }

  @Get('reconcile-runs')
  listRuns(@Query() query: PaginationQuery) {
    return this.reconciler.list(query);
  }

  @Get('payments')
  listPayments(@Query() query: AdminPaymentsQuery) {
    return this.billing.adminListPayments(query);
  }

  @Post('payments/:id/refund')
  @HttpCode(200)
  @Roles('admin')
  async refund(@Param('id') id: string, @CurrentUser() actor: User) {
    return { payment: await this.billing.refund(Number(id), actor) };
  }
}
