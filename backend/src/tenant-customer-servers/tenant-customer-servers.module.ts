import { Module } from '@nestjs/common';
import { TenantCustomerServersController } from './tenant-customer-servers.controller';
import { TenantCustomerServersSelfController } from './tenant-customer-servers-self.controller';
import { TenantCustomerServersService } from './tenant-customer-servers.service';

@Module({
  controllers: [TenantCustomerServersController, TenantCustomerServersSelfController],
  providers: [TenantCustomerServersService],
  exports: [TenantCustomerServersService],
})
export class TenantCustomerServersModule {}
