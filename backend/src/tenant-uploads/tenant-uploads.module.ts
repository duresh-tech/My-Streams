import { Module } from '@nestjs/common';
import { TenantUploadsController } from './tenant-uploads.controller';

@Module({
  controllers: [TenantUploadsController],
})
export class TenantUploadsModule {}
