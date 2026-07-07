import { Module } from '@nestjs/common';
import { TenantPaymentModesController } from './tenant-payment-modes.controller';
import { TenantPaymentModesSelfController } from './tenant-payment-modes-self.controller';
import { TenantPaymentModesService } from './tenant-payment-modes.service';

@Module({
  controllers: [TenantPaymentModesController, TenantPaymentModesSelfController],
  providers: [TenantPaymentModesService],
  exports: [TenantPaymentModesService],
})
export class TenantPaymentModesModule {}
