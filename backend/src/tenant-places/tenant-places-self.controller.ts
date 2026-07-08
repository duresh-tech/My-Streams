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
import { TenantPlacesService } from './tenant-places.service';
import { CreateTenantPlaceDto, UpdateTenantPlaceDto } from './dto/tenant-place.dto';
import { TenantPlaceListQueryDto } from './dto/tenant-place-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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

@ApiTags('Tenant / Places')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/places')
export class TenantPlacesSelfController {
  constructor(private readonly tenantPlacesService: TenantPlacesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-places:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a place.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantPlacesService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-places:list')
  @ApiOperation({
    summary: "List the caller's own places",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated place list.',
    schema: {
      example: {
        items: [TENANT_PLACE_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantPlaceListQueryDto) {
    return this.tenantPlacesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-places:view')
  @ApiOperation({ summary: "Get one of the caller's own places by id" })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place detail.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantPlacesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-places:create')
  @ApiOperation({
    summary: "Create a place for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Place created.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantPlaceDto) {
    return this.tenantPlacesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-places:update')
  @ApiOperation({ summary: "Update one of the caller's own places" })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place updated.',
    schema: { example: TENANT_PLACE_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantPlaceDto,
  ) {
    return this.tenantPlacesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-places:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own places" })
  @ApiParam({ name: 'id', description: 'Place UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Place deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Place not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantPlacesService.removeForTenantUser(user.id, id);
  }
}
