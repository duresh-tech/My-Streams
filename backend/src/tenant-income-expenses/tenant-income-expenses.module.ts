import { Module } from '@nestjs/common';
import { TenantIncomeExpensesSelfController } from './tenant-income-expenses-self.controller';
import { TenantIncomeExpensesService } from './tenant-income-expenses.service';

@Module({
  controllers: [TenantIncomeExpensesSelfController],
  providers: [TenantIncomeExpensesService],
})
export class TenantIncomeExpensesModule {}
