import { Module } from '@nestjs/common';
import { TenantPlacesController } from './tenant-places.controller';
import { TenantPlacesSelfController } from './tenant-places-self.controller';
import { TenantPlacesService } from './tenant-places.service';

@Module({
  controllers: [TenantPlacesController, TenantPlacesSelfController],
  providers: [TenantPlacesService],
  exports: [TenantPlacesService],
})
export class TenantPlacesModule {}
