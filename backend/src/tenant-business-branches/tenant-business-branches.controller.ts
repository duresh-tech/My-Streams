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
import { TenantBusinessBranchesService } from './tenant-business-branches.service';
import {
  CreateTenantBusinessBranchDto,
  UpdateTenantBusinessBranchDto,
} from './dto/tenant-business-branch.dto';
import { TenantBusinessBranchListQueryDto } from './dto/tenant-business-branch-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

const TENANT_BUSINESS_BRANCH_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'BRN-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  branchName: 'Downtown Branch',
  email: 'downtown@acme.test',
  phone: '+1 555 0100',
  addressLine1: '221B Baker Street',
  addressLine2: null,
  description: 'Flagship storefront',
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

@ApiTags('System / Tenant Business Branches')
@ApiBearerAuth()
@Controller('system/tenant-business-branches')
export class TenantBusinessBranchesController {
  constructor(private readonly tenantBusinessBranchesService: TenantBusinessBranchesService) {}

  @Get()
  @RequirePermissions('tenant-business-branches:list')
  @ApiOperation({
    summary: 'List tenant business branches',
    description:
      'Paginated, searchable, filterable, sortable list of tenant business branches. ' +
      'Defaults to excluding deleted rows unless status=DELETED is explicitly requested.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated tenant business branch list.',
    schema: {
      example: {
        items: [TENANT_BUSINESS_BRANCH_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantBusinessBranchListQueryDto) {
    return this.tenantBusinessBranchesService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-business-branches:view')
  @ApiOperation({ summary: 'Get a tenant business branch by id' })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch detail.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantBusinessBranchesService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-business-branches:create')
  @ApiOperation({ summary: 'Create a tenant business branch' })
  @ApiResponse({
    status: 201,
    description: 'Branch created.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Tenant business does not exist or is deleted.' })
  create(@Body() dto: CreateTenantBusinessBranchDto) {
    return this.tenantBusinessBranchesService.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('tenant-business-branches:update')
  @ApiOperation({ summary: 'Update a tenant business branch' })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch updated.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found.' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantBusinessBranchDto) {
    return this.tenantBusinessBranchesService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('tenant-business-branches:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant business branch',
    description: 'Sets status=DELETED and records deletedAt; recoverable via the restore endpoint.',
  })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found.' })
  remove(@Param('id') id: string) {
    return this.tenantBusinessBranchesService.remove(id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-business-branches:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant business branch',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on currently-deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch restored.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found or not deleted.' })
  restore(@Param('id') id: string) {
    return this.tenantBusinessBranchesService.restore(id);
  }
}
