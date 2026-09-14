import { Module } from '@nestjs/common';
import { TenantDashboardController } from './tenant-dashboard.controller';
import { TenantDashboardService } from './tenant-dashboard.service';

@Module({
  controllers: [TenantDashboardController],
  providers: [TenantDashboardService],
})
export class TenantDashboardModule {}
