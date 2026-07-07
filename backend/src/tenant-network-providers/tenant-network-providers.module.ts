import { Module } from '@nestjs/common';
import { TenantNetworkProvidersController } from './tenant-network-providers.controller';
import { TenantNetworkProvidersSelfController } from './tenant-network-providers-self.controller';
import { TenantNetworkProvidersService } from './tenant-network-providers.service';

@Module({
  controllers: [TenantNetworkProvidersController, TenantNetworkProvidersSelfController],
  providers: [TenantNetworkProvidersService],
  exports: [TenantNetworkProvidersService],
})
export class TenantNetworkProvidersModule {}
