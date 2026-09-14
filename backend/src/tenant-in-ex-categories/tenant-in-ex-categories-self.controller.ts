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
import { TenantInExCategoriesService } from './tenant-in-ex-categories.service';
import {
  CreateTenantInExCategoryDto,
  UpdateTenantInExCategoryDto,
} from './dto/tenant-in-ex-category.dto';
import { TenantInExCategoryListQueryDto } from './dto/tenant-in-ex-category-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_IN_EX_CATEGORY_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'INX-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  type: 'EXPENSE',
  name: 'Travel',
  inExCode: 'TRAVEL',
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

@ApiTags('Tenant / Income & Expense Categories')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/in-ex-categories')
export class TenantInExCategoriesSelfController {
  constructor(private readonly tenantInExCategoriesService: TenantInExCategoriesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-in-ex-categories:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a category.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantInExCategoriesService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-in-ex-categories:list')
  @ApiOperation({
    summary: "List the caller's own income/expense categories",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated category list.',
    schema: {
      example: {
        items: [TENANT_IN_EX_CATEGORY_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantInExCategoryListQueryDto,
  ) {
    return this.tenantInExCategoriesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-in-ex-categories:view')
  @ApiOperation({ summary: "Get one of the caller's own income/expense categories by id" })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category detail.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantInExCategoriesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-in-ex-categories:create')
  @ApiOperation({
    summary: "Create an income/expense category for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Category created.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantInExCategoryDto) {
    return this.tenantInExCategoriesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-in-ex-categories:update')
  @ApiOperation({ summary: "Update one of the caller's own income/expense categories" })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category updated.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'System categories cannot be edited.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantInExCategoryDto,
  ) {
    return this.tenantInExCategoriesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-in-ex-categories:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own income/expense categories" })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'System categories cannot be deleted.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantInExCategoriesService.removeForTenantUser(
      user.id,
      id,
      user.permissions.includes('tenant-in-ex-categories:delete_system'),
    );
  }
}
