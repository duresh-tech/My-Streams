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
import { TenantStreetsService } from './tenant-streets.service';
import { CreateTenantStreetDto, UpdateTenantStreetDto } from './dto/tenant-street.dto';
import { TenantStreetListQueryDto } from './dto/tenant-street-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_STREET_EXAMPLE = {
  id: '019f357b-e5b1-73aa-9062-adc0f927a584',
  systemCode: 'STR-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  tenantPlaceId: '019f357b-d398-73aa-9062-adc0f927a584',
  streetCode: 'MGR',
  streetName: 'MG Road',
  latitude: 28.61390000,
  longitude: 77.20900000,
  remark: 'Main entrance street',
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

@ApiTags('System / Tenant Streets')
@ApiBearerAuth()
@Controller('system/tenant-streets')
export class TenantStreetsController {
  constructor(private readonly tenantStreetsService: TenantStreetsService) {}

  @Get('places')
  @RequirePermissions('tenant-streets:list')
  @ApiOperation({
    summary: 'List places for a tenant business',
    description: 'Used to populate the place picker when creating/editing a street.',
  })
  @ApiQuery({ name: 'tenantBusinessId', required: true })
  @ApiResponse({
    status: 200,
    description: 'Places belonging to the given business.',
    schema: {
      example: [
        {
          id: '019f357b-d398-73aa-9062-adc0f927a584',
          placeName: 'Warehouse - Sector 12',
          latitude: 28.61390000,
          longitude: 77.20900000,
          radiusMeters: 100,
        },
      ],
    },
  })
  listPlaces(@Query('tenantBusinessId') tenantBusinessId: string) {
    return this.tenantStreetsService.listPlaces(tenantBusinessId);
  }

  @Get()
  @RequirePermissions('tenant-streets:list')
  @ApiOperation({
    summary: 'List tenant streets',
    description:
      'Paginated, searchable, filterable, sortable list of tenant streets. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant street list.',
    schema: {
      example: {
        items: [TENANT_STREET_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantStreetListQueryDto) {
    return this.tenantStreetsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-streets:view')
  @ApiOperation({ summary: 'Get a tenant street by id' })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street detail.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Street not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantStreetsService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-streets:create')
  @ApiOperation({
    summary: 'Create a tenant street',
    description:
      'tenantPlaceId must belong to the given tenantBusinessId. streetCode must be 3 uppercase letters and unique within the business.',
  })
  @ApiResponse({
    status: 201,
    description: 'Street created.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business or place does not exist, or streetCode is already used for this business.' })
  create(@Body() dto: CreateTenantStreetDto) {
    return this.tenantStreetsService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-streets:update')
  @ApiOperation({ summary: 'Update a tenant street' })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street updated.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Street not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantStreetDto) {
    return this.tenantStreetsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-streets:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant street',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Street not found.' })
  remove(@Param('id') id: string) {
    return this.tenantStreetsService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-streets:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant street',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street restored.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Street not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantStreetsService.restore(id);
  }
}
