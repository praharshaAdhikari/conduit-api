import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserId } from '../auth/current-user.decorator';
import { PaginationQuery } from '../common/pagination.dto';
import { User } from '../user/user.entity';
import { CheckoutRequest } from './membership.dto';
import { MembershipService } from './membership.service';
import { PLANS } from './plans';

@ApiTags('membership')
@Controller('membership')
export class MembershipController {
  constructor(private readonly memberships: MembershipService) {}

  @Get('plans')
  plans() {
    return { plans: PLANS };
  }

  @Get()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async get(@CurrentUserId() userId: number) {
    return { membership: await this.memberships.get(userId) };
  }

  @Post('checkout')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async checkout(@Body() body: CheckoutRequest, @CurrentUser() user: User) {
    const { checkoutUrl } = await this.memberships.startCheckout(
      user,
      body.membership.plan,
    );
    return { checkoutUrl };
  }

  @Post('cancel')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async cancel(@CurrentUserId() userId: number) {
    return { membership: await this.memberships.cancel(userId) };
  }

  @Post('resume')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async resume(@CurrentUserId() userId: number) {
    return { membership: await this.memberships.resume(userId) };
  }

  @Get('history')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  history(@CurrentUserId() userId: number, @Query() query: PaginationQuery) {
    return this.memberships.history(userId, query);
  }

  @Get('payments')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  payments(@CurrentUserId() userId: number, @Query() query: PaginationQuery) {
    return this.memberships.listPayments(userId, query);
  }
}
