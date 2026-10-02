import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { ArticleModule } from './article/article.module';
import { AuthModule } from './auth/auth.module';
import { CommentModule } from './comment/comment.module';
import { typeOrmOptions } from './database/typeorm-options';
import { HealthController } from './health/health.controller';
import { ProfileModule } from './profile/profile.module';
import { TagController } from './tag/tag.controller';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    // Reads .env into process.env; variables already set win.
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmOptions }),
    AuthModule,
    UserModule,
    ProfileModule,
    ArticleModule,
    CommentModule,
    AdminModule,
  ],
  controllers: [HealthController, TagController],
})
export class AppModule {}
