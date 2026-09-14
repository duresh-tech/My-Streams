import { Module } from '@nestjs/common';
import { TenantSubscriptionPlansController } from './tenant-subscription-plans.controller';
import { TenantSubscriptionPlansSelfController } from './tenant-subscription-plans-self.controller';
import { TenantSubscriptionPlansService } from './tenant-subscription-plans.service';

@Module({
  controllers: [TenantSubscriptionPlansController, TenantSubscriptionPlansSelfController],
  providers: [TenantSubscriptionPlansService],
  exports: [TenantSubscriptionPlansService],
})
export class TenantSubscriptionPlansModule {}
