import { Module } from '@nestjs/common';
import { TenantExpenseCategoriesController } from './tenant-expense-categories.controller';
import { TenantExpenseCategoriesSelfController } from './tenant-expense-categories-self.controller';
import { TenantExpenseCategoriesService } from './tenant-expense-categories.service';

@Module({
  controllers: [TenantExpenseCategoriesController, TenantExpenseCategoriesSelfController],
  providers: [TenantExpenseCategoriesService],
  exports: [TenantExpenseCategoriesService],
})
export class TenantExpenseCategoriesModule {}
