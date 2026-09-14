import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TenantCustomerServersService } from './tenant-customer-servers.service';
import {
  CreateTenantCustomerServerDto,
  UpdateTenantCustomerServerDto,
} from './dto/tenant-customer-server.dto';
import { TenantCustomerServerListQueryDto } from './dto/tenant-customer-server-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const ASSIGNMENT_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'CSV-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
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
  tenantCustomer: { id: '019f357b-c211-71a0-9062-adc0f927a222', customerCode: 'CUS001', fName: 'John', lName: null, status: 'ACTIVE' },
  server: { id: '019f357b-c211-71a0-9062-adc0f927a111', systemCode: 'FLS-MR8NZ6OO-C0CB', name: 'SX', status: 'ACTIVE' },
};

@ApiTags('System / Tenant Customer Servers')
@ApiBearerAuth()
@Controller('system/tenant-customer-servers')
export class TenantCustomerServersController {
  constructor(private readonly service: TenantCustomerServersService) {}

  @Get()
  @RequirePermissions('tenant-customer-servers:list')
  @ApiOperation({
    summary: 'List customer-to-server assignments',
    description:
      'Each row carries streamsUsed and streamsRemaining, counted live from the streams table, ' +
      'so a limit can be read against actual usage. streamsRemaining is null when the limit is ' +
      'unlimited.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated assignments.',
    schema: { example: { items: [ASSIGNMENT_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } },
  })
  findAll(@Query() query: TenantCustomerServerListQueryDto) {
    return this.service.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-customer-servers:view')
  @ApiOperation({ summary: 'Get an assignment by id' })
  @ApiParam({ name: 'id', description: 'Assignment UUIDv7' })
  @ApiResponse({ status: 200, description: 'Assignment detail.', schema: { example: ASSIGNMENT_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Assignment not found.' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-customer-servers:create')
  @ApiOperation({
    summary: 'Assign a server to a customer',
    description:
      'One assignment per customer per server. A null streamLimit means unlimited, which is not ' +
      'the same as 0. Marking an assignment dedicated is refused when the server is assigned to ' +
      'any other customer.',
  })
  @ApiResponse({ status: 201, description: 'Assigned.', schema: { example: ASSIGNMENT_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Already assigned, not in this business, or dedication conflict.' })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantCustomerServerDto) {
    return this.service.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('tenant-customer-servers:update')
  @ApiOperation({
    summary: 'Update an assignment',
    description:
      'The customer and server can be reassigned, but not while the customer still has streams ' +
      'on the current server - streams do not follow the assignment, so moving it would leave ' +
      'them running with nothing granting access. A limit below current usage is refused rather ' +
      'than leaving the customer instantly over quota.',
  })
  @ApiParam({ name: 'id', description: 'Assignment UUIDv7' })
  @ApiResponse({ status: 200, description: 'Updated.', schema: { example: ASSIGNMENT_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Limit below current usage, or dedication conflict.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantCustomerServerDto,
  ) {
    return this.service.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('tenant-customer-servers:delete')
  @ApiOperation({
    summary: 'Revoke an assignment',
    description:
      'Refused while the customer still has streams on that server - revoking would leave those ' +
      'streams running with no assignment behind them.',
  })
  @ApiParam({ name: 'id', description: 'Assignment UUIDv7' })
  @ApiResponse({ status: 200, description: 'Revoked.', schema: { example: { success: true } } })
  @ApiResponse({ status: 400, description: 'The customer still has streams on this server.' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.service.remove(id, user.id);
  }
}
