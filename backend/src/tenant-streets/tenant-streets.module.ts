import { Module } from '@nestjs/common';
import { TenantStreetsController } from './tenant-streets.controller';
import { TenantStreetsSelfController } from './tenant-streets-self.controller';
import { TenantStreetsService } from './tenant-streets.service';

@Module({
  controllers: [TenantStreetsController, TenantStreetsSelfController],
  providers: [TenantStreetsService],
  exports: [TenantStreetsService],
})
export class TenantStreetsModule {}
