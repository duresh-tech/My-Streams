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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantCountersService } from './tenant-counters.service';
import { CreateTenantCounterDto, UpdateTenantCounterDto } from './dto/tenant-counter.dto';
import { TenantCounterListQueryDto } from './dto/tenant-counter-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_COUNTER_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'CTR-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  tenantPlaceId: '019f357b-d398-73aa-9062-adc0f927a584',
  counterCode: 'CNT001',
  counterName: 'Counter 1',
  description: 'Front desk billing counter',
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
  tenantPlace: {
    id: '019f357b-d398-73aa-9062-adc0f927a584',
    systemCode: 'PLC-MR8NZ6OO-C0CB',
    placeName: 'Warehouse - Sector 12',
  },
};

@ApiTags('Tenant / Counters')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/counters')
export class TenantCountersSelfController {
  constructor(private readonly tenantCountersService: TenantCountersService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-counters:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a counter.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantCountersService.listMappedBusinesses(user.id);
  }

  @Get('places')
  @RequireTenantPermissions('tenant-counters:list')
  @ApiOperation({
    summary: "List places for one of the caller's own businesses",
    description: 'Used to populate the (optional) place picker when creating/editing a counter.',
  })
  @ApiQuery({ name: 'tenantBusinessId', required: true })
  @ApiResponse({
    status: 200,
    description: 'Places belonging to the given business.',
    schema: {
      example: [{ id: '019f357b-d398-73aa-9062-adc0f927a584', placeName: 'Warehouse - Sector 12' }],
    },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  listPlaces(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query('tenantBusinessId') tenantBusinessId: string,
  ) {
    return this.tenantCountersService.listPlacesForTenantUser(user.id, tenantBusinessId);
  }

  @Get()
  @RequireTenantPermissions('tenant-counters:list')
  @ApiOperation({
    summary: "List the caller's own counters",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated counter list.',
    schema: {
      example: {
        items: [TENANT_COUNTER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantCounterListQueryDto) {
    return this.tenantCountersService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-counters:view')
  @ApiOperation({ summary: "Get one of the caller's own counters by id" })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter detail.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Counter not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantCountersService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-counters:create')
  @ApiOperation({
    summary: "Create a counter for one of the caller's own businesses",
    description:
      'tenantBusinessId must be one of the businesses the caller is actively mapped to, ' +
      'and tenantPlaceId (if given) must belong to it.',
  })
  @ApiResponse({
    status: 201,
    description: 'Counter created.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantCounterDto) {
    return this.tenantCountersService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-counters:update')
  @ApiOperation({ summary: "Update one of the caller's own counters" })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter updated.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Counter not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantCounterDto,
  ) {
    return this.tenantCountersService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-counters:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own counters" })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Counter not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantCountersService.removeForTenantUser(user.id, id);
  }
}
