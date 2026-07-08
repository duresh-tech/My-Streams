import { Module } from '@nestjs/common';
import { TenantCustomersController } from './tenant-customers.controller';
import { TenantCustomersSelfController } from './tenant-customers-self.controller';
import { TenantCustomersService } from './tenant-customers.service';

@Module({
  controllers: [TenantCustomersController, TenantCustomersSelfController],
  providers: [TenantCustomersService],
  exports: [TenantCustomersService],
})
export class TenantCustomersModule {}
