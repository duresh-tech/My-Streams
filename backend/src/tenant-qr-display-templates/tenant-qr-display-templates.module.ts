import { Module } from '@nestjs/common';
import { TenantQrDisplayTemplatesController } from './tenant-qr-display-templates.controller';
import { TenantQrDisplayTemplatesSelfController } from './tenant-qr-display-templates-self.controller';
import { TenantQrDisplayTemplatesService } from './tenant-qr-display-templates.service';

@Module({
  controllers: [TenantQrDisplayTemplatesController, TenantQrDisplayTemplatesSelfController],
  providers: [TenantQrDisplayTemplatesService],
  exports: [TenantQrDisplayTemplatesService],
})
export class TenantQrDisplayTemplatesModule {}
