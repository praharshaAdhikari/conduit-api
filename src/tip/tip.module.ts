import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleModule } from '../article/article.module';
import {
  AdminTipController,
  TipController,
  UserTipController,
} from './tip.controller';
import { EmailVerification, Tip } from './tip.entity';
import { TipService } from './tip.service';

@Module({
  imports: [ArticleModule, TypeOrmModule.forFeature([Tip, EmailVerification])],
  controllers: [TipController, UserTipController, AdminTipController],
  providers: [TipService],
  exports: [TipService],
})
export class TipModule {}
