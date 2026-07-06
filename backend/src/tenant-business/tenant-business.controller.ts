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
import { TenantBusinessService } from './tenant-business.service';
import { CreateTenantBusinessDto, UpdateTenantBusinessDto } from './dto/tenant-business.dto';
import { TenantBusinessListQueryDto } from './dto/tenant-business-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_BUSINESS_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'TNB-MR8NZ6OO-C0CB',
  name: 'Acme Retail Pvt Ltd',
  tagLine: 'Quality you can trust',
  email: 'contact@acmeretail.com',
  phone: '+91-9876543210',
  country: 'India',
  countryCode: 'IN',
  state: 'Karnataka',
  city: 'Bengaluru',
  pincode: '560001',
  addressLine1: '221B Commerce Street',
  addressLine2: 'Suite 4',
  logoPath: 'general/019f357c-d489-74a9-8490-1f82e745b199.jpg',
  taxNumber: '29ABCDE1234F1Z5',
  isParentBusiness: true,
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
};

@ApiTags('System / Tenant Business')
@ApiBearerAuth()
@Controller('system/tenant-business')
export class TenantBusinessController {
  constructor(private readonly tenantBusinessService: TenantBusinessService) {}

  @Get()
  @RequirePermissions('tenant-business:list')
  @ApiOperation({
    summary: 'List tenant businesses',
    description:
      'Paginated, searchable, filterable, sortable list of tenant businesses. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant business list.',
    schema: {
      example: {
        items: [TENANT_BUSINESS_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantBusinessListQueryDto) {
    return this.tenantBusinessService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-business:view')
  @ApiOperation({ summary: 'Get a tenant business by id' })
  @ApiParam({ name: 'id', description: 'Tenant business UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant business detail.',
    schema: { example: TENANT_BUSINESS_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant business not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantBusinessService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-business:create')
  @ApiOperation({ summary: 'Create a tenant business' })
  @ApiResponse({
    status: 201,
    description: 'Tenant business created.',
    schema: { example: TENANT_BUSINESS_EXAMPLE },
  })
  create(@Body() dto: CreateTenantBusinessDto) {
    return this.tenantBusinessService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-business:update')
  @ApiOperation({ summary: 'Update a tenant business' })
  @ApiParam({ name: 'id', description: 'Tenant business UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant business updated.',
    schema: { example: TENANT_BUSINESS_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant business not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantBusinessDto) {
    return this.tenantBusinessService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-business:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant business',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Tenant business UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant business deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Tenant business not found.' })
  remove(@Param('id') id: string) {
    return this.tenantBusinessService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-business:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant business',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Tenant business UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Tenant business restored.',
    schema: { example: TENANT_BUSINESS_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant business not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantBusinessService.restore(id);
  }
}
