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
import { TenantStreetsService } from './tenant-streets.service';
import { CreateTenantStreetDto, UpdateTenantStreetDto } from './dto/tenant-street.dto';
import { TenantStreetListQueryDto } from './dto/tenant-street-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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

@ApiTags('Tenant / Streets')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/streets')
export class TenantStreetsSelfController {
  constructor(private readonly tenantStreetsService: TenantStreetsService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-streets:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a street.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantStreetsService.listMappedBusinesses(user.id);
  }

  @Get('places')
  @RequireTenantPermissions('tenant-streets:list')
  @ApiOperation({
    summary: 'List places for one of the caller\'s own businesses',
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
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  listPlaces(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query('tenantBusinessId') tenantBusinessId: string,
  ) {
    return this.tenantStreetsService.listPlacesForTenantUser(user.id, tenantBusinessId);
  }

  @Get()
  @RequireTenantPermissions('tenant-streets:list')
  @ApiOperation({
    summary: "List the caller's own streets",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated street list.',
    schema: {
      example: {
        items: [TENANT_STREET_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantStreetListQueryDto) {
    return this.tenantStreetsService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-streets:view')
  @ApiOperation({ summary: "Get one of the caller's own streets by id" })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street detail.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Street not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreetsService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-streets:create')
  @ApiOperation({
    summary: "Create a street for one of the caller's own businesses",
    description:
      'tenantBusinessId must be one of the businesses the caller is actively mapped to, and tenantPlaceId must belong to it. streetCode must be 3 uppercase letters and unique within the business.',
  })
  @ApiResponse({
    status: 201,
    description: 'Street created.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantStreetDto) {
    return this.tenantStreetsService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-streets:update')
  @ApiOperation({ summary: "Update one of the caller's own streets" })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street updated.',
    schema: { example: TENANT_STREET_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Street not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantStreetDto,
  ) {
    return this.tenantStreetsService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-streets:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own streets" })
  @ApiParam({ name: 'id', description: 'Street UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Street deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Street not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreetsService.removeForTenantUser(user.id, id);
  }
}
