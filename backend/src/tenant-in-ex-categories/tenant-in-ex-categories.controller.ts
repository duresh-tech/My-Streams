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
import { TenantInExCategoriesService } from './tenant-in-ex-categories.service';
import {
  CreateTenantInExCategoryDto,
  UpdateTenantInExCategoryDto,
} from './dto/tenant-in-ex-category.dto';
import { TenantInExCategoryListQueryDto } from './dto/tenant-in-ex-category-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

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

@ApiTags('System / Tenant Income & Expense Categories')
@ApiBearerAuth()
@Controller('system/tenant-in-ex-categories')
export class TenantInExCategoriesController {
  constructor(private readonly tenantInExCategoriesService: TenantInExCategoriesService) {}

  @Get()
  @RequirePermissions('tenant-in-ex-categories:list')
  @ApiOperation({
    summary: 'List tenant income/expense categories',
    description:
      'Paginated, searchable, filterable, sortable list of tenant income/expense categories. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant income/expense category list.',
    schema: {
      example: {
        items: [TENANT_IN_EX_CATEGORY_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantInExCategoryListQueryDto) {
    return this.tenantInExCategoriesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-in-ex-categories:view')
  @ApiOperation({ summary: 'Get a tenant income/expense category by id' })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category detail.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantInExCategoriesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-in-ex-categories:create')
  @ApiOperation({ summary: 'Create a tenant income/expense category' })
  @ApiResponse({
    status: 201,
    description: 'Category created.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantInExCategoryDto) {
    return this.tenantInExCategoriesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-in-ex-categories:update')
  @ApiOperation({ summary: 'Update a tenant income/expense category' })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category updated.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'System categories cannot be edited.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantInExCategoryDto) {
    return this.tenantInExCategoriesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-in-ex-categories:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant income/expense category',
    description:
      'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint. ' +
      'System categories (isSystem=true) cannot be deleted.',
  })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 400, description: 'System categories cannot be deleted.' })
  @ApiResponse({ status: 404, description: 'Category not found.' })
  remove(@Param('id') id: string) {
    return this.tenantInExCategoriesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-in-ex-categories:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant income/expense category',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Category UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Category restored.',
    schema: { example: TENANT_IN_EX_CATEGORY_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Category not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantInExCategoriesService.restore(id);
  }
}
