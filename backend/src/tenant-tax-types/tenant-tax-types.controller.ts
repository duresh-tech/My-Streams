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
import { TenantTaxTypesService } from './tenant-tax-types.service';
import { CreateTenantTaxTypeDto, UpdateTenantTaxTypeDto } from './dto/tenant-tax-type.dto';
import { TenantTaxTypeListQueryDto } from './dto/tenant-tax-type-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_TAX_TYPE_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'TAX-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  taxName: 'GST 18%',
  calculationType: 'PERCENTAGE',
  value: 18,
  description: 'Standard GST rate',
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

@ApiTags('System / Tenant Tax Types')
@ApiBearerAuth()
@Controller('system/tenant-tax-types')
export class TenantTaxTypesController {
  constructor(private readonly tenantTaxTypesService: TenantTaxTypesService) {}

  @Get()
  @RequirePermissions('tenant-tax-types:list')
  @ApiOperation({
    summary: 'List tenant tax types',
    description:
      'Paginated, searchable, filterable, sortable list of tenant tax types. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant tax type list.',
    schema: {
      example: {
        items: [TENANT_TAX_TYPE_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantTaxTypeListQueryDto) {
    return this.tenantTaxTypesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-tax-types:view')
  @ApiOperation({ summary: 'Get a tenant tax type by id' })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type detail.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantTaxTypesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-tax-types:create')
  @ApiOperation({
    summary: 'Create a tenant tax type',
    description: 'value is a percentage (0-100) when calculationType=PERCENTAGE, or a fixed amount otherwise.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tax type created.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantTaxTypeDto) {
    return this.tenantTaxTypesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-tax-types:update')
  @ApiOperation({ summary: 'Update a tenant tax type' })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type updated.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantTaxTypeDto) {
    return this.tenantTaxTypesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-tax-types:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant tax type',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found.' })
  remove(@Param('id') id: string) {
    return this.tenantTaxTypesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-tax-types:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant tax type',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type restored.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantTaxTypesService.restore(id);
  }
}
