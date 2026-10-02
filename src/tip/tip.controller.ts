import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard';
import { CurrentUser, CurrentUserId } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { TokenService } from '../auth/token.service';
import { User } from '../user/user.entity';
import {
  AdminTipsQuery,
  CreateTipRequest,
  UserTipsQuery,
  VerifyRequest,
} from './tip.dto';
import { TipService } from './tip.service';

export const GUEST_TOKEN_HEADER = 'x-guest-token';

// No route here needs a login: a tip is addressed by its reference, which
// only the person who started it has.
@ApiTags('tips')
@Controller('tips')
export class TipController {
  constructor(
    private readonly tips: TipService,
    private readonly tokens: TokenService,
  ) {}

  @Post()
  @UseGuards(OptionalAuthGuard)
  async create(
    @Body() body: CreateTipRequest,
    @CurrentUser() viewer?: User,
    @Headers(GUEST_TOKEN_HEADER) guestToken?: string,
  ) {
    const { tip, checkoutUrl } = await this.tips.create(
      body.tip,
      viewer,
      this.tokens.verifyGuest(guestToken),
    );
    return { tip, checkoutUrl };
  }

  @Get(':reference')
  async get(@Param('reference') reference: string) {
    return { tip: await this.tips.get(reference) };
  }

  @Post(':reference/verify')
  @HttpCode(200)
  async verify(
    @Param('reference') reference: string,
    @Body() body: VerifyRequest,
  ) {
    const { tip, checkoutUrl, guestToken } = await this.tips.verify(
      reference,
      body.verification.code,
    );
    return { tip, checkoutUrl, guestToken };
  }

  @Post(':reference/resend')
  @HttpCode(200)
  async resend(@Param('reference') reference: string) {
    return { tip: await this.tips.resend(reference) };
  }
}

@ApiTags('tips')
@Controller('user/tips')
@UseGuards(AuthGuard)
@ApiBearerAuth()
export class UserTipController {
  constructor(private readonly tips: TipService) {}

  @Get()
  list(@CurrentUserId() userId: number, @Query() query: UserTipsQuery) {
    return this.tips.listForUser(userId, query.direction, query);
  }
}

@ApiTags('admin')
@Controller('admin/tips')
@UseGuards(AuthGuard, RolesGuard)
@Roles('moderator')
@ApiBearerAuth()
export class AdminTipController {
  constructor(private readonly tips: TipService) {}

  @Get()
  list(@Query() query: AdminTipsQuery) {
    return this.tips.adminList(query);
  }
}
