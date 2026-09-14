import { Module } from '@nestjs/common';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { TenantCustomersController } from './tenant-customers.controller';
import { TenantCustomersSelfController } from './tenant-customers-self.controller';
import { TenantCustomersService } from './tenant-customers.service';

@Module({
  // For the "Login as customer" route, which mints a customer session.
  imports: [CustomerAuthModule],
  controllers: [TenantCustomersController, TenantCustomersSelfController],
  providers: [TenantCustomersService],
  exports: [TenantCustomersService],
})
export class TenantCustomersModule {}
