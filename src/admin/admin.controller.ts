import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { Roles } from '../auth/roles';
import { RolesGuard } from '../auth/roles.guard';
import { PaginationQuery } from '../common/pagination.dto';
import { User } from '../user/user.entity';
import {
  AdminArticlesQuery,
  AdminUsersQuery,
  ModerationRequest,
  SetRoleRequest,
} from './admin.dto';
import { AdminService } from './admin.service';

// Everything here needs a moderator; changing roles needs an admin.
@ApiTags('admin')
@Controller('admin')
@UseGuards(AuthGuard, RolesGuard)
@Roles('moderator')
@ApiBearerAuth()
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('users')
  listUsers(@Query() query: AdminUsersQuery) {
    return this.admin.listUsers(query);
  }

  @Post('users/:username/suspend')
  @HttpCode(200)
  async suspend(
    @Param('username') username: string,
    @Body() body: ModerationRequest,
    @CurrentUser() actor: User,
  ) {
    const { reason } = body.moderation;
    return { user: await this.admin.suspend(username, reason, actor) };
  }

  @Delete('users/:username/suspend')
  async unsuspend(
    @Param('username') username: string,
    @CurrentUser() actor: User,
  ) {
    return { user: await this.admin.unsuspend(username, actor) };
  }

  @Put('users/:username/role')
  @Roles('admin')
  async setRole(
    @Param('username') username: string,
    @Body() body: SetRoleRequest,
    @CurrentUser() actor: User,
  ) {
    return { user: await this.admin.setRole(username, body.user.role, actor) };
  }

  @Get('articles')
  listArticles(@Query() query: AdminArticlesQuery) {
    return this.admin.listArticles(query);
  }

  @Post('articles/:slug/hide')
  @HttpCode(200)
  async hide(
    @Param('slug') slug: string,
    @Body() body: ModerationRequest,
    @CurrentUser() actor: User,
  ) {
    const { reason } = body.moderation;
    return { article: await this.admin.hide(slug, reason, actor) };
  }

  @Delete('articles/:slug/hide')
  async unhide(@Param('slug') slug: string, @CurrentUser() actor: User) {
    return { article: await this.admin.unhide(slug, actor) };
  }

  @Get('actions')
  listActions(@Query() query: PaginationQuery) {
    return this.admin.listActions(query);
  }
}
