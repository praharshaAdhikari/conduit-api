import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { LoginRequest, RegisterRequest, UpdateUserRequest } from './user.dto';
import { UserService } from './user.service';

@ApiTags('user and authentication')
@Controller()
export class UserController {
  constructor(private readonly users: UserService) {}

  @Post('users')
  register(@Body() body: RegisterRequest) {
    return this.users.register(body.user);
  }

  @Post('users/login')
  @HttpCode(200)
  login(@Body() body: LoginRequest) {
    return this.users.login(body.user);
  }

  @Get('user')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  current(@CurrentUserId() userId: number) {
    return this.users.current(userId);
  }

  @Put('user')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  update(@CurrentUserId() userId: number, @Body() body: UpdateUserRequest) {
    return this.users.update(userId, body.user);
  }
}
