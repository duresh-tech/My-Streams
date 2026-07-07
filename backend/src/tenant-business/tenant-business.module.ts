import { Module } from '@nestjs/common';
import { TenantBusinessController } from './tenant-business.controller';
import { TenantBusinessSelfController } from './tenant-business-self.controller';
import { TenantBusinessService } from './tenant-business.service';

@Module({
  controllers: [TenantBusinessController, TenantBusinessSelfController],
  providers: [TenantBusinessService],
  exports: [TenantBusinessService],
})
export class TenantBusinessModule {}
