import { Module } from '@nestjs/common';
import { TenantInExCategoriesController } from './tenant-in-ex-categories.controller';
import { TenantInExCategoriesSelfController } from './tenant-in-ex-categories-self.controller';
import { TenantInExCategoriesService } from './tenant-in-ex-categories.service';

@Module({
  controllers: [TenantInExCategoriesController, TenantInExCategoriesSelfController],
  providers: [TenantInExCategoriesService],
  exports: [TenantInExCategoriesService],
})
export class TenantInExCategoriesModule {}
