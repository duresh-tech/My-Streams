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
import { TenantPlacesService } from './tenant-places.service';
import { CreateTenantPlaceDto, UpdateTenantPlaceDto } from './dto/tenant-place.dto';
import { TenantPlaceListQueryDto } from './dto/tenant-place-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_PLACE_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'PLC-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  placeName: 'Warehouse - Sector 12',
  remark: 'Main storage facility',
  latitude: 28.61390000,
  longitude: 77.20900000,
  radiusMeters: 100,
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

@ApiTags('System / Tenant Places')
@ApiBearerAuth()
@Controller('system/tenant-places')
export class TenantPlacesController {
  constructor(private readonly tenantPlacesService: TenantPlacesService) {}

  @Get()
  @RequirePermissions('tenant-places:list')
  @ApiOperation({
    summary: 'List tenant places',
    description:
      'Paginated, searchable, filterable, sortable list of tenant places. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant place list.',
    schema: {
      example: {
        items: [TENANT_PLACE_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantPlaceListQueryDto) {
    return this.tenantPlacesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-places:view')
  @ApiOperation({ summary: 'Get a tenant place by id' })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place detail.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantPlacesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-places:create')
  @ApiOperation({ summary: 'Create a tenant place' })
  @ApiResponse({
    status: 201,
    description: 'Place created.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantPlaceDto) {
    return this.tenantPlacesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-places:update')
  @ApiOperation({ summary: 'Update a tenant place' })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place updated.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantPlaceDto) {
    return this.tenantPlacesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-places:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant place',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  remove(@Param('id') id: string) {
    return this.tenantPlacesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-places:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant place',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place restored.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Place not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantPlacesService.restore(id);
  }
}
