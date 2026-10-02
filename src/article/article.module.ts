import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProfileModule } from '../profile/profile.module';
import { UserModule } from '../user/user.module';
import { ArticleController } from './article.controller';
import { Article, ArticleTag, Favorite, Tag } from './article.entity';
import { ArticleService } from './article.service';

@Module({
  imports: [
    ProfileModule,
    UserModule,
    TypeOrmModule.forFeature([Article, Tag, ArticleTag, Favorite]),
  ],
  controllers: [ArticleController],
  providers: [ArticleService],
  exports: [ArticleService, TypeOrmModule],
})
export class ArticleModule {}
