import { Module } from '@nestjs/common';
import { TenantQrDevicesController } from './tenant-qr-devices.controller';
import { TenantQrDevicesSelfController } from './tenant-qr-devices-self.controller';
import { TenantQrDevicesService } from './tenant-qr-devices.service';

@Module({
  controllers: [TenantQrDevicesController, TenantQrDevicesSelfController],
  providers: [TenantQrDevicesService],
  exports: [TenantQrDevicesService],
})
export class TenantQrDevicesModule {}
