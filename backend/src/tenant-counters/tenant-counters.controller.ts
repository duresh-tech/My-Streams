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
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantCountersService } from './tenant-counters.service';
import { CreateTenantCounterDto, UpdateTenantCounterDto } from './dto/tenant-counter.dto';
import { TenantCounterListQueryDto } from './dto/tenant-counter-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

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

@ApiTags('System / Tenant Counters')
@ApiBearerAuth()
@Controller('system/tenant-counters')
export class TenantCountersController {
  constructor(private readonly tenantCountersService: TenantCountersService) {}

  @Get('places')
  @RequirePermissions('tenant-counters:list')
  @ApiOperation({
    summary: 'List places for a tenant business',
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
  listPlaces(@Query('tenantBusinessId') tenantBusinessId: string) {
    return this.tenantCountersService.listPlaces(tenantBusinessId);
  }

  @Get()
  @RequirePermissions('tenant-counters:list')
  @ApiOperation({
    summary: 'List tenant counters',
    description:
      'Paginated, searchable, filterable, sortable list of tenant counters. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant counter list.',
    schema: {
      example: {
        items: [TENANT_COUNTER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantCounterListQueryDto) {
    return this.tenantCountersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-counters:view')
  @ApiOperation({ summary: 'Get a tenant counter by id' })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter detail.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Counter not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantCountersService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-counters:create')
  @ApiOperation({
    summary: 'Create a tenant counter',
    description:
      'tenantPlaceId is optional but, if given, must belong to the given tenantBusinessId. ' +
      'counterCode must be unique within the business.',
  })
  @ApiResponse({
    status: 201,
    description: 'Counter created.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business or place does not exist, or counterCode is already used for this business.' })
  create(@Body() dto: CreateTenantCounterDto) {
    return this.tenantCountersService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-counters:update')
  @ApiOperation({ summary: 'Update a tenant counter' })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter updated.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Counter not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantCounterDto) {
    return this.tenantCountersService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-counters:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant counter',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Counter not found.' })
  remove(@Param('id') id: string) {
    return this.tenantCountersService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-counters:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant counter',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Counter UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Counter restored.',
    schema: { example: TENANT_COUNTER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Counter not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantCountersService.restore(id);
  }
}
