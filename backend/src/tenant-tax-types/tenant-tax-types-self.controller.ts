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
import { TenantTaxTypesService } from './tenant-tax-types.service';
import { CreateTenantTaxTypeDto, UpdateTenantTaxTypeDto } from './dto/tenant-tax-type.dto';
import { TenantTaxTypeListQueryDto } from './dto/tenant-tax-type-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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

@ApiTags('Tenant / Tax Types')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/tax-types')
export class TenantTaxTypesSelfController {
  constructor(private readonly tenantTaxTypesService: TenantTaxTypesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-tax-types:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a tax type.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantTaxTypesService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-tax-types:list')
  @ApiOperation({
    summary: "List the caller's own tax types",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tax type list.',
    schema: {
      example: {
        items: [TENANT_TAX_TYPE_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantTaxTypeListQueryDto) {
    return this.tenantTaxTypesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-tax-types:view')
  @ApiOperation({ summary: 'Get one of the caller\'s own tax types by id' })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type detail.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantTaxTypesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-tax-types:create')
  @ApiOperation({
    summary: 'Create a tax type for one of the caller\'s own businesses',
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Tax type created.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantTaxTypeDto) {
    return this.tenantTaxTypesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-tax-types:update')
  @ApiOperation({ summary: 'Update one of the caller\'s own tax types' })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type updated.',
    schema: { example: TENANT_TAX_TYPE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantTaxTypeDto,
  ) {
    return this.tenantTaxTypesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-tax-types:delete')
  @ApiOperation({ summary: 'Soft-delete one of the caller\'s own tax types' })
  @ApiParam({ name: 'id', description: 'Tax type UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tax type deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Tax type not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantTaxTypesService.removeForTenantUser(user.id, id);
  }
}
