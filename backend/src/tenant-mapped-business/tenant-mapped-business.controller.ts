import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { TenantMappedBusinessService } from './tenant-mapped-business.service';
import {
  ChangeMappedBusinessStatusDto,
  CreateMappedBusinessDto,
  UpdateMappedBusinessDto,
} from './dto/tenant-mapped-business.dto';
import { TenantMappedBusinessListQueryDto } from './dto/tenant-mapped-business-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const MAPPING_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'TMB-MR8NZ6OO-C0CB',
  status: 'ACTIVE',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  deletedAt: null,
  tenantUser: {
    id: '019f357b-aaaa-73aa-9062-adc0f927a584',
    systemCode: 'TNU-MR8NZ6OO-A1B2',
    fName: 'John Doe',
    username: 'john.doe',
    email: 'john@example.com',
    status: 'ACTIVE',
  },
  tenantBusiness: {
    id: '019f357b-bbbb-73aa-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C3D4',
    name: 'PDP Cable TV',
    email: 'contact@pdpcable.com',
    status: 'ACTIVE',
  },
};

@ApiTags('Tenant / Mapped Business')
@ApiBearerAuth()
@Controller('tenant/mapped-business')
export class TenantMappedBusinessController {
  constructor(private readonly tenantMappedBusinessService: TenantMappedBusinessService) {}

  @Get()
  @RequirePermissions('tenant-mapped-business:list')
  @ApiOperation({
    summary: 'List tenant-to-business mappings',
    description:
      'Paginated, searchable, filterable list. Defaults to excluding deleted rows ' +
      'unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated mapping list.',
    schema: {
      example: {
        items: [MAPPING_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantMappedBusinessListQueryDto) {
    return this.tenantMappedBusinessService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-mapped-business:view')
  @ApiOperation({ summary: 'Get a mapping by id' })
  @ApiParam({ name: 'id', description: 'Mapping UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mapping detail with resolved tenant user and business.',
    schema: { example: MAPPING_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mapping not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantMappedBusinessService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-mapped-business:create')
  @ApiOperation({
    summary: 'Assign a business to a tenant user',
    description:
      'A tenant user can be mapped to only one business at a time (tenantUserId is ' +
      'unique). Revives a previously soft-deleted mapping for this tenant user instead ' +
      'of erroring; rejects with 409 if the tenant user already has an active mapping ' +
      '(use PUT to reassign it instead).',
  })
  @ApiResponse({
    status: 201,
    description: 'Mapping created (or revived).',
    schema: { example: MAPPING_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Tenant user or tenant business not found.' })
  @ApiResponse({ status: 409, description: 'Tenant user is already mapped to a business.' })
  create(@Body() dto: CreateMappedBusinessDto) {
    return this.tenantMappedBusinessService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('tenant-mapped-business:update')
  @ApiOperation({ summary: 'Replace a mapping\'s tenant user, business, and/or status' })
  @ApiParam({ name: 'id', description: 'Mapping UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mapping updated.',
    schema: { example: MAPPING_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mapping, tenant user, or tenant business not found.' })
  @ApiResponse({ status: 409, description: 'That tenant user is already mapped to a business.' })
  update(@Param('id') id: string, @Body() dto: UpdateMappedBusinessDto) {
    return this.tenantMappedBusinessService.update(id, dto);
  }

  @Patch(':id/status')
  @RequirePermissions('tenant-mapped-business:update')
  @ApiOperation({ summary: 'Change a mapping\'s status (ACTIVE/INACTIVE/BLOCKED)' })
  @ApiParam({ name: 'id', description: 'Mapping UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mapping status updated.',
    schema: { example: MAPPING_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mapping not found.' })
  changeStatus(@Param('id') id: string, @Body() dto: ChangeMappedBusinessStatusDto) {
    return this.tenantMappedBusinessService.changeStatus(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-mapped-business:delete')
  @ApiOperation({
    summary: 'Soft-delete a mapping',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Mapping UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mapping deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Mapping not found.' })
  remove(@Param('id') id: string) {
    return this.tenantMappedBusinessService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-mapped-business:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted mapping',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Mapping UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Mapping restored.',
    schema: { example: MAPPING_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Mapping not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantMappedBusinessService.restore(id);
  }
}
