import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantExpenseCategoriesService } from './tenant-expense-categories.service';
import {
  CreateTenantExpenseCategoryDto,
  UpdateTenantExpenseCategoryDto,
} from './dto/tenant-expense-category.dto';
import { TenantExpenseCategoryListQueryDto } from './dto/tenant-expense-category-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_EXPENSE_CATEGORY_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'EXP-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  expenseCategorieName: 'Travel',
  description: 'Employee travel and conveyance',
  isSystem: false,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
};

@ApiTags('System / Tenant Expense Categories')
@ApiBearerAuth()
@Controller('system/tenant-expense-categories')
export class TenantExpenseCategoriesController {
  constructor(private readonly tenantExpenseCategoriesService: TenantExpenseCategoriesService) {}

  @Get()
  @RequirePermissions('tenant-expense-categories:list')
  @ApiOperation({
    summary: 'List tenant expense categories',
    description:
      'Paginated, searchable, filterable, sortable list of tenant expense categories. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant expense category list.',
    schema: {
      example: {
        items: [TENANT_EXPENSE_CATEGORY_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantExpenseCategoryListQueryDto) {
    return this.tenantExpenseCategoriesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-expense-categories:view')
  @ApiOperation({ summary: 'Get a tenant expense category by id' })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category detail.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Expense category not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantExpenseCategoriesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-expense-categories:create')
  @ApiOperation({ summary: 'Create a tenant expense category' })
  @ApiResponse({
    status: 201,
    description: 'Expense category created.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantExpenseCategoryDto) {
    return this.tenantExpenseCategoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-expense-categories:update')
  @ApiOperation({ summary: 'Update a tenant expense category' })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category updated.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'System expense categories cannot be edited.' })
  @ApiResponse({ status: 404, description: 'Expense category not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantExpenseCategoryDto) {
    return this.tenantExpenseCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-expense-categories:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant expense category',
    description:
      'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint. ' +
      'System expense categories (isSystem=true) cannot be deleted.',
  })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'System expense categories cannot be deleted.' })
  @ApiResponse({ status: 404, description: 'Expense category not found.' })
  remove(@Param('id') id: string) {
    return this.tenantExpenseCategoriesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-expense-categories:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant expense category',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category restored.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Expense category not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantExpenseCategoriesService.restore(id);
  }
}
