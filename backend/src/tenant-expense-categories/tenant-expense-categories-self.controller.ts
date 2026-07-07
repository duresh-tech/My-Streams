import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
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
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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

@ApiTags('Tenant / Expense Categories')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/expense-categories')
export class TenantExpenseCategoriesSelfController {
  constructor(private readonly tenantExpenseCategoriesService: TenantExpenseCategoriesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-expense-categories:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing an expense category.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantExpenseCategoriesService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-expense-categories:list')
  @ApiOperation({
    summary: "List the caller's own expense categories",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated expense category list.',
    schema: {
      example: {
        items: [TENANT_EXPENSE_CATEGORY_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantExpenseCategoryListQueryDto,
  ) {
    return this.tenantExpenseCategoriesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-expense-categories:view')
  @ApiOperation({ summary: "Get one of the caller's own expense categories by id" })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category detail.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Expense category not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantExpenseCategoriesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-expense-categories:create')
  @ApiOperation({
    summary: "Create an expense category for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Expense category created.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantExpenseCategoryDto) {
    return this.tenantExpenseCategoriesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-expense-categories:update')
  @ApiOperation({ summary: "Update one of the caller's own expense categories" })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category updated.',
    schema: { example: TENANT_EXPENSE_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'System expense categories cannot be edited.' })
  @ApiResponse({ status: 404, description: 'Expense category not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantExpenseCategoryDto,
  ) {
    return this.tenantExpenseCategoriesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-expense-categories:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own expense categories" })
  @ApiParam({ name: 'id', description: 'Expense category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Expense category deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'System expense categories cannot be deleted.' })
  @ApiResponse({ status: 404, description: 'Expense category not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantExpenseCategoriesService.removeForTenantUser(user.id, id);
  }
}
