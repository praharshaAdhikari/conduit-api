import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ArticleModule } from '../article/article.module';
import { UserModule } from '../user/user.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { ModerationAction } from './moderation-action.entity';

@Module({
  imports: [
    UserModule,
    ArticleModule,
    TypeOrmModule.forFeature([ModerationAction]),
  ],
  controllers: [AdminController],
  providers: [AdminService],
  exports: [AdminService],
})
export class AdminModule {}
