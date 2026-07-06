import { Module } from '@nestjs/common';
import { TenantTaxTypesController } from './tenant-tax-types.controller';
import { TenantTaxTypesSelfController } from './tenant-tax-types-self.controller';
import { TenantTaxTypesService } from './tenant-tax-types.service';

@Module({
  controllers: [TenantTaxTypesController, TenantTaxTypesSelfController],
  providers: [TenantTaxTypesService],
  exports: [TenantTaxTypesService],
})
export class TenantTaxTypesModule {}
