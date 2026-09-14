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
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantCustomerServersService } from './tenant-customer-servers.service';
import {
  CreateTenantCustomerServerSelfDto,
  UpdateTenantCustomerServerSelfDto,
} from './dto/tenant-customer-server.dto';
import { TenantCustomerServerListQueryDto } from './dto/tenant-customer-server-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import {
  CurrentTenantUser,
  TenantAuthUser,
} from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const ASSIGNMENT_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'CSV-MR8NZ6OO-C0CB',
  tenantCustomerId: '019f357b-c211-71a0-9062-adc0f927a222',
  serverId: '019f357b-c211-71a0-9062-adc0f927a111',
  streamLimit: 10,
  isDedicated: false,
  remark: null,
  status: 'ACTIVE',
  streamsUsed: 3,
  streamsRemaining: 7,
  createdAt: 1783308735,
  updatedAt: 1783308735,
};

@ApiTags('Tenant / Customer Servers')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/customer-servers')
export class TenantCustomerServersSelfController {
  constructor(private readonly service: TenantCustomerServersService) {}

  @Get()
  @RequireTenantPermissions('tenant-customer-servers:list')
  @ApiOperation({
    summary: 'List which servers your customers may use',
    description:
      'Each row carries streamsUsed and streamsRemaining, counted live from the streams table. ' +
      'streamsRemaining is null when the limit is unlimited.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated assignments.',
    schema: { example: { items: [ASSIGNMENT_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantCustomerServerListQueryDto,
  ) {
    return this.service.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-customer-servers:view')
  @ApiOperation({ summary: 'Get one of your assignments by id' })
  @ApiParam({ name: 'id', description: 'Assignment UUIDv7' })
  @ApiResponse({ status: 200, description: 'Assignment detail.', schema: { example: ASSIGNMENT_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Assignment not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.service.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-customer-servers:create')
  @ApiOperation({
    summary: 'Assign one of your servers to one of your customers',
    description:
      "The business comes from the caller's mapping. One assignment per customer per server; a " +
      'null streamLimit means unlimited. Dedication is refused when the server is assigned to ' +
      'another customer.',
  })
  @ApiResponse({ status: 201, description: 'Assigned.', schema: { example: ASSIGNMENT_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Already assigned, not yours, or dedication conflict.' })
  create(
    @CurrentTenantUser() user: TenantAuthUser,
    @Body() dto: CreateTenantCustomerServerSelfDto,
  ) {
    return this.service.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-customer-servers:update')
  @ApiOperation({
    summary: 'Update one of your assignments',
    description:
      'The customer and server can be reassigned, but not while the customer still has streams ' +
      'on the current server. A limit below current usage is refused.',
  })
  @ApiParam({ name: 'id', description: 'Assignment UUIDv7' })
  @ApiResponse({ status: 200, description: 'Updated.', schema: { example: ASSIGNMENT_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Limit below current usage, or dedication conflict.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantCustomerServerSelfDto,
  ) {
    return this.service.updateForTenantUser(user.id, id, dto);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-customer-servers:delete')
  @ApiOperation({
    summary: 'Revoke one of your assignments',
    description: 'Refused while the customer still has streams on that server.',
  })
  @ApiParam({ name: 'id', description: 'Assignment UUIDv7' })
  @ApiResponse({ status: 200, description: 'Revoked.', schema: { example: { success: true } } })
  @ApiResponse({ status: 400, description: 'The customer still has streams on this server.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.service.removeForTenantUser(user.id, id);
  }
}
