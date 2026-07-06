import { Module } from '@nestjs/common';
import { TenantDashboardController } from './tenant-dashboard.controller';

@Module({
  controllers: [TenantDashboardController],
})
export class TenantDashboardModule {}
