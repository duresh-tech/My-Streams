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
import { TenantFlussonicServersService } from './tenant-flussonic-servers.service';
import {
  CreateTenantFlussonicServerDto,
  UpdateTenantFlussonicServerDto,
} from './dto/tenant-flussonic-server.dto';
import { TenantFlussonicServerListQueryDto } from './dto/tenant-flussonic-server-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const TENANT_FLUSSONIC_SERVER_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'FLS-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  name: 'Edge Server 01',
  hostName: '10.20.30.40',
  hostPort: 8080,
  domain: 'edge01.example.com',
  useSSL: true,
  apiUsername: 'apiuser',
  apiBasePath: '/streamer/api/v3',
  apiVersionTag: 'v3',
  serverVersion: '24.11',
  remark: 'Primary edge node',
  status: 'ACTIVE',
  connectionStatus: 'CONNECTED',
  connectionCheckedAt: 1783308800,
  hasApiPassword: true,
  hasApiAccessToken: false,
  createdAt: 1783308735,
  createdBy: '019f357b-d398-73aa-9062-adc0f927a111',
  updatedAt: 1783308735,
  updatedBy: '019f357b-d398-73aa-9062-adc0f927a111',
  deletedAt: null,
  deletedBy: null,
  tenantBusiness: {
    id: '019f357b-c211-71a0-9062-adc0f927a584',
    systemCode: 'TNB-MR8NZ6OO-C0CB',
    name: 'Acme Retail Pvt Ltd',
  },
};

const SERVER_STATS_EXAMPLE = {
  server: TENANT_FLUSSONIC_SERVER_EXAMPLE,
  live: true,
  liveError: null,
  stats: {
    serverVersion: '24.10',
    build: 110,
    hostname: 'edge01.example.com',
    runtimeId: '1f2e3d4c',
    startedAt: 1757577600,
    serverTime: 1757836800,
    uptime: 259200,
    cpuUsage: 37,
    memoryUsage: 52,
    schedulerLoad: 18,
    bandwidthUsage: 412000,
    totalBandwidth: 1000000,
    totalClients: 184,
    totalStreams: 48,
    onlineStreams: 45,
    openedFiles: 312,
    inputKbit: 96000,
    outputKbit: 412000,
    streamerStatus: 'running',
    licenseType: 'commercial',
    configVersion: '12',
    nextVersion: null,
    configError: null,
    textAlerts: {},
    transcoderCapable: true,
    partitions: [{ path: '/storage', size: 2000000000000, used: 900000000000, available: 1100000000000, usedPercent: 45 }],
    cpuUnits: 32,
    ramBytes: 68719476736,
    inputsBandwidth: 96000000,
    outputBandwidth: 412000000,
    transcodedStreams: 3,
    openedSessions: 184,
    totalSessions: 90412,
    dvrStorageBytes: 900000000000,
  },
};

@ApiTags('System / Tenant Streaming Servers')
@ApiBearerAuth()
@Controller('system/tenant-streaming-servers')
export class TenantFlussonicServersController {
  constructor(
    private readonly tenantFlussonicServersService: TenantFlussonicServersService,
  ) {}

  @Get()
  @RequirePermissions('tenant-streaming-servers:list')
  @ApiOperation({
    summary: 'List tenant streaming servers',
    description:
      'Paginated, searchable, filterable, sortable list. Defaults to excluding deleted rows ' +
      'unless status=DELETED is explicitly requested. Stored credentials are never returned - ' +
      'only the hasApiPassword / hasApiAccessToken flags.',
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated server list.',
    schema: {
      example: {
        items: [TENANT_FLUSSONIC_SERVER_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(@Query() query: TenantFlussonicServerListQueryDto) {
    return this.tenantFlussonicServersService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-streaming-servers:view')
  @ApiOperation({ summary: 'Get a tenant streaming server by id' })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server detail.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantFlussonicServersService.findOne(id);
  }

  @Get(':id/stats')
  @RequirePermissions('tenant-streaming-servers:view')
  @ApiOperation({
    summary: 'Get a streaming server with its live runtime status',
    description:
      'Reads the version, load, client and stream counts and throughput from the server ' +
      'itself. The read doubles as a connectivity check and records its outcome on the ' +
      'record, so an unreachable server answers 200 with live:false and the reason in ' +
      'liveError rather than failing.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server detail with live status.',
    schema: { example: SERVER_STATS_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  viewStats(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.viewStats(id, user.id);
  }

  @Post()
  @RequirePermissions('tenant-streaming-servers:create')
  @ApiOperation({
    summary: 'Create a tenant streaming server',
    description:
      'apiPassword and apiAccessToken are accepted in plaintext and stored ' +
      'AES-256-GCM encrypted. Server name must be unique within the business.',
  })
  @ApiResponse({
    status: 201,
    description: 'Server created.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({
    status: 400,
    description: 'Tenant business does not exist, or server name already used for this business.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantFlussonicServerDto) {
    return this.tenantFlussonicServersService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('tenant-streaming-servers:update')
  @ApiOperation({
    summary: 'Update a tenant streaming server',
    description:
      'Omit apiPassword / apiAccessToken to keep the stored secret; ' +
      'send an empty string to clear it.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server updated.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantFlussonicServerDto,
  ) {
    return this.tenantFlussonicServersService.update(id, dto, user.id);
  }

  @Delete(':id')
  @RequirePermissions('tenant-streaming-servers:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant streaming server',
    description: 'Sets status=DELETED and records deletedAt/deletedBy; recoverable via restore.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.remove(id, user.id);
  }

  @Post(':id/check-connection')
  @RequirePermissions('tenant-streaming-servers:sync')
  @ApiOperation({
    summary: "Check a server's connectivity and record the result",
    description:
      "Calls the server's own API with the stored credentials and saves the outcome to " +
      'connectionStatus (CONNECTED, UNAUTHORIZED, UNREACHABLE, or UNKNOWN when no credentials ' +
      'are stored) along with connectionCheckedAt. A failed check is a recorded state, not an ' +
      'error response.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Check performed; the returned row carries the new connectionStatus.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  checkConnection(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.checkConnection(id, user.id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-streaming-servers:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant streaming server',
    description: 'Sets status back to ACTIVE and clears deletedAt. Only works on deleted rows.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server restored.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found or not deleted.' })
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.restore(id, user.id);
  }
}
