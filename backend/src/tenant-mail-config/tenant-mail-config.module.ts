import { Module } from '@nestjs/common';
import { TenantMailConfigController } from './tenant-mail-config.controller';
import { TenantMailConfigSelfController } from './tenant-mail-config-self.controller';
import { TenantMailConfigService } from './tenant-mail-config.service';

@Module({
  controllers: [TenantMailConfigController, TenantMailConfigSelfController],
  providers: [TenantMailConfigService],
  exports: [TenantMailConfigService],
})
export class TenantMailConfigModule {}
