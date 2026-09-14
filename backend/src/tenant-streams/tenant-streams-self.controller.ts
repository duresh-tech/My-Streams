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
import { TenantStreamsService } from './tenant-streams.service';
import {
  CreateTenantStreamSelfDto,
  UpdateTenantStreamSelfDto,
} from './dto/tenant-stream.dto';
import { TenantStreamListQueryDto } from './dto/tenant-stream-query.dto';
import { AdoptStreamDto } from './dto/adopt-stream.dto';
import { RenameStreamDto } from './dto/rename-stream.dto';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import {
  CurrentTenantUser,
  TenantAuthUser,
} from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

const TENANT_STREAM_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'STR-MR8NZ6OO-C0CB',
  serverId: '019f357b-c211-71a0-9062-adc0f927a111',
  tenantCustomerId: '019f357b-c211-71a0-9062-adc0f927a222',
  applicationName: 'app-restream',
  streamKey: '2fx62e-royaltv',
  name: 'app-restream/2fx62e-royaltv',
  title: 'ROYAL TV - TSY',
  isStatic: true,
  disabled: false,
  protocols: { whitelist: true, hls: true, rtmp: true },
  status: 'ACTIVE',
  syncStatus: 'PENDING_PUSH',
  createdAt: 1783308735,
  updatedAt: 1783308735,
  inputs: [{ priority: 1, url: 'rtmp://royaltv.example.com/live/STRM-BX74', sourceTimeout: 30 }],
};

@ApiTags('Tenant / Streams')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/streams')
export class TenantStreamsSelfController {
  constructor(private readonly tenantStreamsService: TenantStreamsService) {}

  @Post('sync')
  @RequireTenantPermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'Reconcile every server in your business',
    description:
      'Runs the per-server reconcile against each active server in turn and returns one summary ' +
      'per server. Used when no particular server is selected.',
  })
  @ApiResponse({
    status: 200,
    description: 'One summary per server.',
    schema: {
      example: [
        { serverId: '019f357b-c211-71a0-9062-adc0f927a111', serverName: 'SX', checked: 48, inSync: 0, pushed: 0, conflicts: 0, unmanaged: 48, skipped: 0, failed: 0 },
      ],
    },
  })
  syncAll(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantStreamsService.syncAllForTenantUser(user.id);
  }

  @Get('unmanaged')
  @RequireTenantPermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'List unmanaged streams across every server in your business',
    description: 'Each row carries the server it was found on, so it can be adopted directly.',
  })
  @ApiResponse({
    status: 200,
    description: 'Unmanaged streams with their server.',
    schema: {
      example: [
        { serverId: '019f357b-c211-71a0-9062-adc0f927a111', serverName: 'SX', name: 'live/ch01', namedBy: 'config', title: 'PDP TV', disabled: false, inputCount: 2, adoptable: true, reason: null },
      ],
    },
  })
  listAllUnmanaged(@CurrentTenantUser() user: TenantAuthUser) {
    return this.tenantStreamsService.listAllUnmanagedForTenantUser(user.id);
  }

  @Post('servers/:serverId/adopt-all')
  @RequireTenantPermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'Adopt every unmanaged stream on one of your servers',
    description:
      'The bulk import for a server that was already in production. Per-stream failures are ' +
      'collected and reported rather than aborting the run.',
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 201,
    description: 'Import result.',
    schema: { example: { adopted: 47, skipped: 1, failed: 0, errors: [{ name: 'bad//name', error: 'Name contains an empty path segment' }] } },
  })
  adoptAll(@CurrentTenantUser() user: TenantAuthUser, @Param('serverId') serverId: string) {
    return this.tenantStreamsService.adoptAllForTenantUser(user.id, serverId);
  }

  @Post('servers/:serverId/sync')
  @RequireTenantPermissions('tenant-streams:sync')
  @ApiOperation({
    summary: "Reconcile one of the caller's servers against our records",
    description:
      'Classifies every stream on the server: in sync, conflict, missing on the server (pushed), ' +
      'or unmanaged. Streams the server reports as user or remote are ignored, and unmanaged ' +
      'streams are never deleted.',
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Reconcile summary.',
    schema: {
      example: { serverId: '019f357b-c211-71a0-9062-adc0f927a111', checked: 12, inSync: 9, pushed: 1, conflicts: 1, unmanaged: 1, skipped: 0, failed: 0 },
    },
  })
  @ApiResponse({ status: 400, description: 'Server does not belong to your business.' })
  syncServer(@CurrentTenantUser() user: TenantAuthUser, @Param('serverId') serverId: string) {
    return this.tenantStreamsService.syncServerForTenantUser(user.id, serverId);
  }

  @Get('servers/:serverId/unmanaged')
  @RequireTenantPermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'List streams on one of your servers with no record here',
    description:
      'adoptable is false when the name is not exactly application/key, since such a stream ' +
      'could not be edited here afterwards.',
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Unmanaged streams.',
    schema: {
      example: [
        { name: 'app-restream/legacy-feed', namedBy: 'config', title: 'Legacy feed', disabled: false, inputCount: 1, adoptable: true, reason: null },
      ],
    },
  })
  listUnmanaged(@CurrentTenantUser() user: TenantAuthUser, @Param('serverId') serverId: string) {
    return this.tenantStreamsService.listUnmanagedForTenantUser(user.id, serverId);
  }

  @Post('servers/:serverId/adopt')
  @RequireTenantPermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'Take over an existing stream on one of your servers',
    description: "Creates a local record from the server's config, already in sync.",
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({ status: 201, description: 'Stream adopted.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Name not adoptable, or already managed here.' })
  adopt(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('serverId') serverId: string,
    @Body() dto: AdoptStreamDto,
  ) {
    return this.tenantStreamsService.adoptForTenantUser(
      user.id,
      serverId,
      dto.name,
      dto.tenantCustomerId,
    );
  }

  @Get()
  @RequireTenantPermissions('tenant-streams:list')
  @ApiOperation({
    summary: "List the caller's own streams",
    description: "Scoped to the caller's business.",
  })
  @ApiResponse({
    status: 200,
    description: 'Paginated stream list.',
    schema: {
      example: {
        items: [TENANT_STREAM_EXAMPLE],
        meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
      },
    },
  })
  findAll(
    @CurrentTenantUser() user: TenantAuthUser,
    @Query() query: TenantStreamListQueryDto,
  ) {
    return this.tenantStreamsService.findAllForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-streams:view')
  @ApiOperation({ summary: "Get one of the caller's own streams by id" })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream detail.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-streams:create')
  @ApiOperation({
    summary: "Create a stream for the caller's business",
    description:
      "The business is taken from the caller's mapping and is not part of the request body. " +
      'The server-side name is derived as applicationName/streamKey.',
  })
  @ApiResponse({ status: 201, description: 'Stream created.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Server or customer not in this business, or name taken.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateTenantStreamSelfDto) {
    return this.tenantStreamsService.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-streams:update')
  @ApiOperation({
    summary: "Update one of the caller's own streams",
    description:
      'applicationName and streamKey cannot be changed here (that is a rename). Supplying ' +
      'inputs replaces the whole list.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream updated.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  update(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantStreamSelfDto,
  ) {
    return this.tenantStreamsService.updateForTenantUser(user.id, id, dto);
  }

  @Get(':id/view')
  @RequireTenantPermissions('tenant-streams:view')
  @ApiOperation({
    summary: 'Live view of one of your streams',
    description:
      'Stored config plus the runtime stats the server reports (status, clients, bitrates, ' +
      'uptime, media tracks) and the publish/playback URLs for its enabled protocols. An ' +
      'unreachable server sets live=false and still returns the config and URLs.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Stream view.',
    schema: {
      example: {
        stream: TENANT_STREAM_EXAMPLE,
        live: true,
        liveError: null,
        stats: { status: 'running', client_count: 3, input_bitrate: 1450, lifetime: 108000 },
        mediaInfo: { tracks: [{ content: 'video', codec: 'h264', bitrate: 1320 }] },
        urls: {
        inputs: [{ protocol: 'rtmp', label: 'RTMP', url: 'rtmp://ingest.example.com:1935/live/ch01' }],
        outputs: [
          { protocol: 'hls', label: 'HLS', url: 'https://ingest.example.com:443/live/ch01/index.m3u8' },
        ],
        host: 'ingest.example.com',
        scheme: 'https',
        webPort: 443,
      },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  view(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.viewForTenantUser(user.id, id);
  }

  @Get(':id/sessions')
  @RequireTenantPermissions('tenant-streams:view_sessions')
  @ApiOperation({
    summary: 'Play sessions for one of your streams',
    description:
      'Read live from the server and filtered to this stream. Nothing is stored - session rows ' +
      'contain viewer IPs, which is why this sits behind its own permission.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Active sessions.',
    schema: {
      example: [
        { id: 'abc', name: 'live/ch01', type: 'play', proto: 'HLS', ip: '49.190.44.186', country: 'AU', user_agent: 'okhttp/4.12.0', bytes: 1048576, opened_at: 1783308735 },
      ],
    },
  })
  sessions(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.sessionsForTenantUser(user.id, id);
  }

  @Post(':id/reload')
  @RequireTenantPermissions('tenant-streams:reload')
  @ApiOperation({
    summary: 'Reload a stream by disabling and re-enabling it',
    description:
      'Disables the stream on the server, waits 1 second so the old source connection is torn ' +
      'down, then re-enables it. Used to recover a stuck source. Viewers are interrupted for ' +
      'the duration. If the re-enable fails the call reports it rather than claiming success - ' +
      'the stream would be left off.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Reloaded.', schema: { example: { success: true, gapMs: 1000 } } })
  @ApiResponse({ status: 400, description: 'Not on the server yet, mid-operation, or the reload failed.' })
  reload(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.reloadForTenantUser(user.id, id);
  }

  @Post(':id/rename')
  @RequireTenantPermissions('tenant-streams:rename')
  @ApiOperation({
    summary: 'Rename one of your streams (destructive)',
    description:
      'The stream is recreated on the server under the new name and the old one is deleted, ' +
      'which disconnects every viewer on the old name. A partial failure leaves it under both ' +
      'names, flagged CONFLICT, rather than under neither.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Rename outcome. `warning` is set when the old name could not be removed.',
    schema: { example: { renamed: true, stream: TENANT_STREAM_EXAMPLE } },
  })
  @ApiResponse({ status: 400, description: 'New name taken, server unreachable, or mid-operation.' })
  rename(
    @CurrentTenantUser() user: TenantAuthUser,
    @Param('id') id: string,
    @Body() dto: RenameStreamDto,
  ) {
    return this.tenantStreamsService.renameForTenantUser(user.id, id, dto);
  }

  @Post(':id/enable')
  @RequireTenantPermissions('tenant-streams:enable')
  @ApiOperation({
    summary: 'Enable one of the caller\'s own streams',
    description:
      "A customer's stream with no active bill (and past grace) is refused unless the caller holds " +
      'tenant-streams:override_billing; then it is enabled and marked billing-exempt until a covering ' +
      'subscription is active again or a user disables it.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream enabled.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 403, description: 'No active bill and no tenant-streams:override_billing.' })
  enable(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.setDisabledForTenantUser(
      user.id,
      id,
      false,
      user.permissions.includes('tenant-streams:override_billing'),
    );
  }

  @Post(':id/disable')
  @RequireTenantPermissions('tenant-streams:disable')
  @ApiOperation({ summary: 'Disable one of the caller\'s own streams' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream disabled.', schema: { example: TENANT_STREAM_EXAMPLE } })
  disable(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.setDisabledForTenantUser(user.id, id, true);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-streams:delete')
  @ApiOperation({ summary: "Soft-delete one of the caller's own streams" })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream deleted.', schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.removeForTenantUser(user.id, id);
  }
}
