import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { ProfileService } from './profile.service';

@ApiTags('profiles')
@Controller('profiles/:username')
export class ProfileController {
  constructor(private readonly profiles: ProfileService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  async get(
    @Param('username') username: string,
    @CurrentUserId() viewerId?: number,
  ) {
    return { profile: await this.profiles.get(username, viewerId) };
  }

  @Post('follow')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async follow(
    @Param('username') username: string,
    @CurrentUserId() viewerId: number,
  ) {
    return { profile: await this.profiles.follow(username, viewerId) };
  }

  @Delete('follow')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async unfollow(
    @Param('username') username: string,
    @CurrentUserId() viewerId: number,
  ) {
    return { profile: await this.profiles.unfollow(username, viewerId) };
  }
}
