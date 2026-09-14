import { Module } from '@nestjs/common';
import { TenantBillingSettingsController } from './tenant-billing-settings.controller';
import { TenantBillingSettingsSelfController } from './tenant-billing-settings-self.controller';
import { TenantBillingSettingsService } from './tenant-billing-settings.service';
import { TenantInvoicesSelfController } from './tenant-invoices-self.controller';
import { TenantInvoicesService } from './tenant-invoices.service';
import { BillingLifecycleService } from './billing-lifecycle.service';
import { TenantStreamsModule } from '../tenant-streams/tenant-streams.module';

/**
 * Billing lives in one module rather than one per resource: subscriptions
 * create invoices and payments activate subscriptions, which split across
 * modules would be an import cycle. See docs/billing-plan.md §9.
 * TenantStreamsModule supplies the stream switch the lifecycle job uses; it
 * does not import billing back.
 */
@Module({
  imports: [TenantStreamsModule],
  controllers: [
    TenantBillingSettingsController,
    TenantBillingSettingsSelfController,
    TenantInvoicesSelfController,
  ],
  providers: [TenantBillingSettingsService, TenantInvoicesService, BillingLifecycleService],
  exports: [TenantBillingSettingsService, TenantInvoicesService],
})
export class TenantBillingModule {}
