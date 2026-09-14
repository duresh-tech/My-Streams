import { Module } from '@nestjs/common';
import { CustomerPortalController } from './customer-portal.controller';
import { CustomerPortalService } from './customer-portal.service';
import { CustomerBillingController } from './customer-billing.controller';
import { CustomerBillingService } from './customer-billing.service';
import { TenantStreamsModule } from '../tenant-streams/tenant-streams.module';
import { CustomerAuthModule } from '../customer-auth/customer-auth.module';
import { TenantFlussonicServersModule } from '../tenant-flussonic-servers/tenant-flussonic-servers.module';

@Module({
  // The portal reuses the tenant stream services so naming, uniqueness, the
  // push to the server and the rename state machine behave identically however
  // a stream was created.
  // TenantFlussonicServersModule provides the connectivity check, so the
  // portal's check behaves exactly like the tenant-side one.
  // StorageService, behind the profile picture upload, comes from a @Global
  // module and so needs no import here.
  imports: [TenantStreamsModule, CustomerAuthModule, TenantFlussonicServersModule],
  controllers: [CustomerPortalController, CustomerBillingController],
  providers: [CustomerPortalService, CustomerBillingService],
})
export class CustomerPortalModule {}
