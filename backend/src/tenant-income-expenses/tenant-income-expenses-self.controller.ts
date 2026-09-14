import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantIncomeExpensesService } from './tenant-income-expenses.service';
import {
  CreateTenantIncomeExpenseDto,
  TenantIncomeExpenseFilterDto,
  TenantIncomeExpenseListQueryDto,
  UpdateTenantIncomeExpenseDto,
} from './dto/tenant-income-expense.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const ENTRY_EXAMPLE = {
  id: '019f3d90-4444-7aaa-9062-adc0f927a584',
  systemCode: 'IEX-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  tenantInExCategoryId: '019f357b-d398-73aa-9062-adc0f927a584',
  tenantPaymentModeId: '019f357b-8888-71a0-9062-adc0f927a584',
  tenantPaymentId: null,
  type: 'EXPENSE',
  amount: 1500,
  entryDate: 1789237800,
  referenceNo: 'BILL-2231',
  remark: 'Server rack rent, September',
  status: 'ACTIVE',
  createdAt: 1789290000,
  createdBy: '019f357b-1111-71a0-9062-adc0f927a584',
  updatedAt: 1789290000,
  updatedBy: '019f357b-1111-71a0-9062-adc0f927a584',
  deletedAt: null,
  deletedBy: null,
  category: { id: '019f357b-d398-73aa-9062-adc0f927a584', name: 'Rent', type: 'EXPENSE' },
  paymentMode: { id: '019f357b-8888-71a0-9062-adc0f927a584', paymentName: 'UPI' },
  invoice: null,
};

@ApiTags('Tenant / Income & Expenses')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/income-expenses')
export class TenantIncomeExpensesSelfController {
  constructor(private readonly service: TenantIncomeExpensesService) {}

  @Get('options')
  @RequireTenantPermissions('tenant-income-expenses:list')
  @ApiOperation({
    summary: 'Categories and payment modes for the entry form and filters',
    description: "Only ACTIVE ones: the business's own categories plus the global system categories.",
  })
  @ApiResponse({
    status: 200,
    description: 'Form options.',
    schema: {
      example: {
        currency: 'INR',
        categories: [{ id: '019f357b-d398-73aa-9062-adc0f927a584', name: 'Rent', type: 'EXPENSE', inExCode: 'RENT' }],
        paymentModes: [{ id: '019f357b-8888-71a0-9062-adc0f927a584', paymentName: 'UPI' }],
      },
    },
  })
  options(@CurrentTenantUser() user: TenantAuthUser) {
    return this.service.optionsForTenantUser(user.id);
  }

  @Get('summary')
  @RequireTenantPermissions('tenant-income-expenses:list')
  @ApiOperation({
    summary: 'Income, expense and net totals',
    description: 'Takes the same filters as the list. VOID entries are never counted.',
  })
  @ApiResponse({ status: 200, description: 'Totals.', schema: { example: { income: 12500, expense: 1500, net: 11000 } } })
  summary(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantIncomeExpenseFilterDto) {
    return this.service.summaryForTenantUser(user.id, query);
  }

  @Get()
  @RequireTenantPermissions('tenant-income-expenses:list')
  @ApiOperation({
    summary: "List your business's income and expense entries",
    description:
      'Filters: type, category, payment mode, status (ACTIVE / VOID), from and to (inclusive dates). ' +
      'search matches the code, reference, remark and category name. Entries with invoice set were ' +
      'recorded from an invoice payment and are read-only.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated entries.',
    schema: { example: { items: [ENTRY_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantIncomeExpenseListQueryDto) {
    return this.service.listForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-income-expenses:view')
  @ApiOperation({ summary: 'Get one income or expense entry' })
  @ApiParam({ name: 'id', description: 'Entry UUIDv7' })
  @ApiResponse({ status: 200, description: 'Entry.', schema: { example: ENTRY_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Entry not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.service.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-income-expenses:create')
  @ApiOperation({
    summary: 'Record an income or expense entry',
    description: 'The type comes from the category. entryDate is a calendar date in the app timezone.',
  })
  @ApiResponse({ status: 201, description: 'Entry created.', schema: { example: ENTRY_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Inactive or unknown category or payment mode.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantIncomeExpenseDto) {
    return this.service.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-income-expenses:update')
  @ApiOperation({ summary: 'Update a manual income or expense entry' })
  @ApiParam({ name: 'id', description: 'Entry UUIDv7' })
  @ApiResponse({ status: 200, description: 'Entry updated.', schema: { example: ENTRY_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Recorded from an invoice payment, voided, or invalid category/mode.' })
  @ApiResponse({ status: 404, description: 'Entry not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantIncomeExpenseDto,
  ) {
    return this.service.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-income-expenses:delete')
  @ApiOperation({ summary: 'Soft-delete a manual income or expense entry' })
  @ApiParam({ name: 'id', description: 'Entry UUIDv7' })
  @ApiResponse({ status: 200, description: 'Entry deleted.', schema: { example: { success: true } } })
  @ApiResponse({ status: 400, description: 'Recorded from an invoice payment, or voided.' })
  @ApiResponse({ status: 404, description: 'Entry not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.service.removeForTenantUser(user.id, id);
  }
}
