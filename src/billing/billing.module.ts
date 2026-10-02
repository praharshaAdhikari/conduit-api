import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminModule } from '../admin/admin.module';
import { MembershipModule } from '../membership/membership.module';
import { TipModule } from '../tip/tip.module';
import { AdminBillingController } from './admin-billing.controller';
import { BillingService } from './billing.service';
import { ReconcileRun } from './reconcile.entity';
import { ReconcileService } from './reconcile.service';
import { WebhookController } from './webhook.controller';

@Module({
  imports: [
    MembershipModule,
    TipModule,
    AdminModule,
    TypeOrmModule.forFeature([ReconcileRun]),
  ],
  controllers: [WebhookController, AdminBillingController],
  providers: [BillingService, ReconcileService],
  exports: [BillingService, ReconcileService],
})
export class BillingModule {}
