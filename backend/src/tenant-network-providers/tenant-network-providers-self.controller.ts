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
import { TenantNetworkProvidersService } from './tenant-network-providers.service';
import {
  CreateTenantNetworkProviderDto,
  UpdateTenantNetworkProviderDto,
} from './dto/tenant-network-provider.dto';
import { TenantNetworkProviderListQueryDto } from './dto/tenant-network-provider-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_NETWORK_PROVIDER_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'NWP-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  type: 'CABLE_TV',
  name: 'Skyline Cable Network',
  email: 'ops@skylinecable.test',
  phone: '+1 555 0100',
  addressLine1: '221B Baker Street',
  addressLine2: null,
  description: 'Primary upstream cable feed provider',
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

@ApiTags('Tenant / Network Providers')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/network-providers')
export class TenantNetworkProvidersSelfController {
  constructor(private readonly tenantNetworkProvidersService: TenantNetworkProvidersService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-network-providers:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a network provider.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantNetworkProvidersService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-network-providers:list')
  @ApiOperation({
    summary: "List the caller's own network providers",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated network provider list.',
    schema: {
      example: {
        items: [TENANT_NETWORK_PROVIDER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantNetworkProviderListQueryDto,
  ) {
    return this.tenantNetworkProvidersService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-network-providers:view')
  @ApiOperation({ summary: "Get one of the caller's own network providers by id" })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider detail.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantNetworkProvidersService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-network-providers:create')
  @ApiOperation({
    summary: "Create a network provider for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Network provider created.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantNetworkProviderDto) {
    return this.tenantNetworkProvidersService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-network-providers:update')
  @ApiOperation({ summary: "Update one of the caller's own network providers" })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider updated.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantNetworkProviderDto,
  ) {
    return this.tenantNetworkProvidersService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-network-providers:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own network providers" })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantNetworkProvidersService.removeForTenantUser(user.id, id);
  }
}
