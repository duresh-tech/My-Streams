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
import { TenantBusinessBranchesService } from './tenant-business-branches.service';
import {
  CreateTenantBusinessBranchDto,
  UpdateTenantBusinessBranchDto,
} from './dto/tenant-business-branch.dto';
import { TenantBusinessBranchListQueryDto } from './dto/tenant-business-branch-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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

@ApiTags('Tenant / Business Branches')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/business-branches')
export class TenantBusinessBranchesSelfController {
  constructor(private readonly tenantBusinessBranchesService: TenantBusinessBranchesService) {}

  @Get('businesses')
  @RequireTenantPermissions('tenant-business-branches:list')
  @ApiOperation({
    summary: "List the caller's own mapped businesses",
    description: 'Used to populate the business picker when creating/editing a branch.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active businesses the caller is mapped to.',
    schema: { example: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Retail Pvt Ltd' }] },
  })
  listBusinesses(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantBusinessBranchesService.listMappedBusinesses(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-business-branches:list')
  @ApiOperation({
    summary: "List the caller's own business branches",
    description: 'Scoped to businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated branch list.',
    schema: {
      example: {
        items: [TENANT_BUSINESS_BRANCH_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: TenantBusinessBranchListQueryDto) {
    return this.tenantBusinessBranchesService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-business-branches:view')
  @ApiOperation({ summary: "Get one of the caller's own business branches by id" })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch detail.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantBusinessBranchesService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-business-branches:create')
  @ApiOperation({
    summary: "Create a branch for one of the caller's own businesses",
    description: 'tenantBusinessId must be one of the businesses the caller is actively mapped to.',
  })
  @ApiResponse({
    status: 201,
    description: 'Branch created.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 403, description: 'Not mapped to that business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantBusinessBranchDto) {
    return this.tenantBusinessBranchesService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-business-branches:update')
  @ApiOperation({ summary: "Update one of the caller's own business branches" })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch updated.',
    schema: { example: TENANT_BUSINESS_BRANCH_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantBusinessBranchDto,
  ) {
    return this.tenantBusinessBranchesService.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-business-branches:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own business branches" })
  @ApiParam({ name: 'id', description: 'Branch UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Branch deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Business branch not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantBusinessBranchesService.removeForTenantUser(user.id, id);
  }
}
