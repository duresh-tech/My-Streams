import { Module } from '@nestjs/common';
import { TenantMappedBusinessController } from './tenant-mapped-business.controller';
import { TenantMappedBusinessService } from './tenant-mapped-business.service';

@Module({
  controllers: [TenantMappedBusinessController],
  providers: [TenantMappedBusinessService],
  exports: [TenantMappedBusinessService],
})
export class TenantMappedBusinessModule {}
