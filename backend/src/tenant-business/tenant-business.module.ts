import { Module } from '@nestjs/common';
import { TenantBusinessController } from './tenant-business.controller';
import { TenantBusinessService } from './tenant-business.service';

@Module({
  controllers: [TenantBusinessController],
  providers: [TenantBusinessService],
  exports: [TenantBusinessService],
})
export class TenantBusinessModule {}
