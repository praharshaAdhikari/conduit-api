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
import { AuthGuard, OptionalAuthGuard } from '../auth/auth.guard';
import { CurrentUserId } from '../auth/current-user.decorator';
import { PaginationQuery } from '../common/pagination.dto';
import {
  CreateArticleRequest,
  ListArticlesQuery,
  UpdateArticleRequest,
} from './article.dto';
import { ArticleService } from './article.service';

@ApiTags('articles')
@Controller('articles')
export class ArticleController {
  constructor(private readonly articles: ArticleService) {}

  @Get()
  @UseGuards(OptionalAuthGuard)
  list(@Query() query: ListArticlesQuery, @CurrentUserId() viewerId?: number) {
    return this.articles.list(query, viewerId);
  }

  // Declared before ':slug' so "feed" is not read as a slug.
  @Get('feed')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  feed(@Query() query: PaginationQuery, @CurrentUserId() viewerId: number) {
    return this.articles.feed(query, viewerId);
  }

  @Get(':slug')
  @UseGuards(OptionalAuthGuard)
  async get(@Param('slug') slug: string, @CurrentUserId() viewerId?: number) {
    return { article: await this.articles.get(slug, viewerId) };
  }

  @Post()
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async create(
    @Body() body: CreateArticleRequest,
    @CurrentUserId() userId: number,
  ) {
    return { article: await this.articles.create(body.article, userId) };
  }

  @Put(':slug')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async update(
    @Param('slug') slug: string,
    @Body() body: UpdateArticleRequest,
    @CurrentUserId() userId: number,
  ) {
    return { article: await this.articles.update(slug, body.article, userId) };
  }

  @Delete(':slug')
  @HttpCode(204)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  delete(@Param('slug') slug: string, @CurrentUserId() userId: number) {
    return this.articles.delete(slug, userId);
  }

  @Post(':slug/favorite')
  @HttpCode(200)
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async favorite(@Param('slug') slug: string, @CurrentUserId() userId: number) {
    return { article: await this.articles.favorite(slug, userId) };
  }

  @Delete(':slug/favorite')
  @UseGuards(AuthGuard)
  @ApiBearerAuth()
  async unfavorite(
    @Param('slug') slug: string,
    @CurrentUserId() userId: number,
  ) {
    return { article: await this.articles.unfavorite(slug, userId) };
  }
}
