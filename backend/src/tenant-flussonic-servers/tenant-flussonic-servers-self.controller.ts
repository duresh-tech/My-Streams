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
import { TenantFlussonicServersService } from './tenant-flussonic-servers.service';
import {
  CreateTenantFlussonicServerSelfDto,
  UpdateTenantFlussonicServerSelfDto,
} from './dto/tenant-flussonic-server.dto';
import { TenantFlussonicServerListQueryDto } from './dto/tenant-flussonic-server-query.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import {
  CurrentTenantUser,
  TenantAuthUser,
} from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

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
  eventsEnabled: true,
  eventTypes: ['source_closed', 'stream_opened', 'stream_closed'],
  eventSinkSyncedAt: 1783308900,
  eventSinkError: null,
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

@ApiTags('Tenant / Streaming Servers')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/streaming-servers')
export class TenantFlussonicServersSelfController {
  constructor(
    private readonly tenantFlussonicServersService: TenantFlussonicServersService,
  ) {}

  @Get()
  @RequireTenantPermissions('tenant-streaming-servers:list')
  @ApiOperation({
    summary: "List the caller's own streaming servers",
    description: 'Scoped to businesses the caller is actively mapped to.',
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
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantFlussonicServerListQueryDto,
  ) {
    return this.tenantFlussonicServersService.findAllForTenantUser(user.id, query);
  }

  @Get('event-options')
  @RequireTenantPermissions('tenant-streaming-servers:list')
  @ApiOperation({
    summary: 'Stream events the server form can offer',
    description:
      'available is false when the backend has no PUBLIC_API_URL, so a server would have nowhere to send ' +
      'events. eventGroups lists the event names by Source / Stream / Viewer; defaultEvents are preselected.',
  })
  @ApiResponse({
    status: 200,
    description: 'Event options.',
    schema: {
      example: {
        available: true,
        eventGroups: [{ group: 'STREAM', label: 'Stream', events: ['stream_opened', 'stream_updated', 'stream_closed'] }],
        defaultEvents: ['source_opened', 'source_connected', 'source_started', 'source_updated', 'source_closed', 'stream_opened', 'stream_updated', 'stream_closed'],
      },
    },
  })
  eventOptions() {
    return this.tenantFlussonicServersService.eventOptions();
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-streaming-servers:view')
  @ApiOperation({ summary: "Get one of the caller's own streaming servers by id" })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server detail.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.findOneForTenantUser(user.id, id);
  }

  @Get(':id/stats')
  @RequireTenantPermissions('tenant-streaming-servers:view')
  @ApiOperation({
    summary: "Get one of the caller's own servers with its live runtime status",
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
  viewStats(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.viewStatsForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-streaming-servers:create')
  @ApiOperation({
    summary: "Create a streaming server for the caller's business",
    description:
      "The business is taken from the caller's mapping and is not part of the request body.",
  })
  @ApiResponse({
    status: 201,
    description: 'Server created.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 400, description: 'Caller is not mapped to a business.' })
  create(
    @CurrentTenantUser() user: TenantAuthUser,
    @Body() dto: CreateTenantFlussonicServerSelfDto,
  ) {
    return this.tenantFlussonicServersService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-streaming-servers:update')
  @ApiOperation({
    summary: "Update one of the caller's own streaming servers",
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
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantFlussonicServerSelfDto,
  ) {
    return this.tenantFlussonicServersService.updateForTenantUser(user.id, id, dto);
  }

  @Post(':id/check-connection')
  @RequireTenantPermissions('tenant-streaming-servers:sync')
  @ApiOperation({
    summary: "Check one of the caller's own servers and record the result",
    description:
      "Calls the server's own API with the stored credentials and saves the outcome to " +
      'connectionStatus and connectionCheckedAt. A failed check is a recorded state, not an ' +
      'error response.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Check performed; the returned row carries the new connectionStatus.',
    schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  checkConnection(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.checkConnectionForTenantUser(user.id, id);
  }

  @Post(':id/event-sink/sync')
  @RequireTenantPermissions('tenant-streaming-servers:update')
  @ApiOperation({
    summary: "Re-apply one of the caller's servers' event settings on the server",
    description:
      'Creates, updates or removes the event sink from the saved eventsEnabled / eventTypes. The outcome ' +
      'is recorded as eventSinkSyncedAt or eventSinkError on the returned server; a failure is not an error response.',
  })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({ status: 201, description: 'Server with the sync outcome.', schema: { example: TENANT_FLUSSONIC_SERVER_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  syncEventSink(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.syncEventSinkForTenantUser(user.id, id);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-streaming-servers:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own streaming servers" })
  @ApiParam({ name: 'id', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Server deleted.',
    schema: { example: { success: true } },
  })
  @ApiResponse({ status: 404, description: 'Server not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantFlussonicServersService.removeForTenantUser(user.id, id);
  }
}
