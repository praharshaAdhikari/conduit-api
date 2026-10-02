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
import { AdminMembershipsQuery } from '../membership/membership.dto';
import { MembershipService } from '../membership/membership.service';
import { User } from '../user/user.entity';
import { AdminPaymentsQuery } from './billing.dto';
import { BillingService } from './billing.service';

// Moderators can look; only an admin can give money back.
@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('moderator')
@ApiBearerAuth()
export class AdminBillingController {
  constructor(
    private readonly billing: BillingService,
    private readonly memberships: MembershipService,
  ) {}

  @Get('memberships')
  listMemberships(@Query() query: AdminMembershipsQuery) {
    return this.memberships.adminList(query);
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
