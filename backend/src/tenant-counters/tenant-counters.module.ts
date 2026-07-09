import { Module } from '@nestjs/common';
import { TenantCountersController } from './tenant-counters.controller';
import { TenantCountersSelfController } from './tenant-counters-self.controller';
import { TenantCountersService } from './tenant-counters.service';

@Module({
  controllers: [TenantCountersController, TenantCountersSelfController],
  providers: [TenantCountersService],
  exports: [TenantCountersService],
})
export class TenantCountersModule {}
