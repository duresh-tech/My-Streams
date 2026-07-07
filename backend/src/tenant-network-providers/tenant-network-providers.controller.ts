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
import { TenantNetworkProvidersService } from './tenant-network-providers.service';
import {
  CreateTenantNetworkProviderDto,
  UpdateTenantNetworkProviderDto,
} from './dto/tenant-network-provider.dto';
import { TenantNetworkProviderListQueryDto } from './dto/tenant-network-provider-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

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

@ApiTags('System / Tenant Network Providers')
@ApiBearerAuth()
@Controller('system/tenant-network-providers')
export class TenantNetworkProvidersController {
  constructor(private readonly tenantNetworkProvidersService: TenantNetworkProvidersService) {}

  @Get()
  @RequirePermissions('tenant-network-providers:list')
  @ApiOperation({
    summary: 'List tenant network providers',
    description:
      'Paginated, searchable, filterable, sortable list of tenant network providers. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant network provider list.',
    schema: {
      example: {
        items: [TENANT_NETWORK_PROVIDER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantNetworkProviderListQueryDto) {
    return this.tenantNetworkProvidersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-network-providers:view')
  @ApiOperation({ summary: 'Get a tenant network provider by id' })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider detail.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantNetworkProvidersService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-network-providers:create')
  @ApiOperation({ summary: 'Create a tenant network provider' })
  @ApiResponse({
    status: 201,
    description: 'Network provider created.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantNetworkProviderDto) {
    return this.tenantNetworkProvidersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-network-providers:update')
  @ApiOperation({ summary: 'Update a tenant network provider' })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider updated.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantNetworkProviderDto) {
    return this.tenantNetworkProvidersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-network-providers:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant network provider',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found.' })
  remove(@Param('id') id: string) {
    return this.tenantNetworkProvidersService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-network-providers:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant network provider',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Network provider UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Network provider restored.',
    schema: { example: TENANT_NETWORK_PROVIDER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Network provider not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantNetworkProvidersService.restore(id);
  }
}
