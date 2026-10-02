import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from './admin/admin.module';
import { ArticleModule } from './article/article.module';
import { AuthModule } from './auth/auth.module';
import { BillingModule } from './billing/billing.module';
import { CommentModule } from './comment/comment.module';
import { typeOrmOptions } from './database/typeorm-options';
import { HealthController } from './health/health.controller';
import { MembershipModule } from './membership/membership.module';
import { PaymentModule } from './payment/payment.module';
import { ProfileModule } from './profile/profile.module';
import { TagController } from './tag/tag.controller';
import { UserModule } from './user/user.module';

@Module({
  imports: [
    // Reads .env into process.env; variables already set win.
    ConfigModule.forRoot(),
    TypeOrmModule.forRootAsync({ useFactory: typeOrmOptions }),
    AuthModule,
    // After ConfigModule: the payment provider is chosen from the environment.
    PaymentModule.forRoot(),
    UserModule,
    ProfileModule,
    ArticleModule,
    CommentModule,
    AdminModule,
    MembershipModule,
    BillingModule,
  ],
  controllers: [HealthController, TagController],
})
export class AppModule {}
