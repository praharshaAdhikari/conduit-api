import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module';
import { MembershipModule } from '../membership/membership.module';
import { AdminBillingController } from './admin-billing.controller';
import { BillingService } from './billing.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [MembershipModule, AdminModule],
  controllers: [WebhookController, AdminBillingController],
  providers: [BillingService],
  exports: [BillingService],
})
export class BillingModule {}
