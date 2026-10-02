import {
  Body,
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
import { CreateCommentRequest } from './comment.dto';
import { CommentService } from './comment.service';

@ApiTags('comments')
@Controller('articles/:slug/comments')
export class CommentController {
  constructor(private readonly comments: CommentService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  async list(@Param('slug') slug: string, @CurrentUserId() viewerId?: number) {
    return { comments: await this.comments.list(slug, viewerId) };
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async add(
    @Param('slug') slug: string,
    @Body() body: CreateCommentRequest,
    @CurrentUserId() userId: number,
  ) {
    return { comment: await this.comments.add(slug, body.comment, userId) };
  }

  @Delete(':id')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  delete(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @CurrentUserId() userId: number,
  ) {
    return this.comments.delete(slug, Number(id), userId);
  }
}
