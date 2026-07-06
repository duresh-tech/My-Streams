import { Module } from '@nestjs/common';
import { TenantTaxTypesController } from './tenant-tax-types.controller';
import { TenantTaxTypesService } from './tenant-tax-types.service';

@Module({
  controllers: [TenantTaxTypesController],
  providers: [TenantTaxTypesService],
  exports: [TenantTaxTypesService],
})
export class TenantTaxTypesModule {}
