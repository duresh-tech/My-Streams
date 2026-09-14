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
import { TenantStreamsService } from './tenant-streams.service';
import { TenantStreamSyncService } from './tenant-stream-sync.service';
import { AdoptStreamDto } from './dto/adopt-stream.dto';
import { RenameStreamDto } from './dto/rename-stream.dto';
import { CreateTenantStreamDto, UpdateTenantStreamDto } from './dto/tenant-stream.dto';
import { TenantStreamListQueryDto } from './dto/tenant-stream-query.dto';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';

const TENANT_STREAM_EXAMPLE = {
  id: '019f357b-d398-73aa-9062-adc0f927a584',
  systemCode: 'STR-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  serverId: '019f357b-c211-71a0-9062-adc0f927a111',
  tenantCustomerId: '019f357b-c211-71a0-9062-adc0f927a222',
  applicationName: 'app-restream',
  streamKey: '2fx62e-royaltv',
  name: 'app-restream/2fx62e-royaltv',
  title: 'ROYAL TV - TSY',
  ingestDomain: 'ingest.example.com',
  comment: null,
  retryLimit: 10,
  sourceTimeout: 30,
  isStatic: true,
  disabled: false,
  protocols: { whitelist: true, hls: true, rtmp: true, srt: false },
  namedBy: null,
  status: 'ACTIVE',
  syncStatus: 'PENDING_PUSH',
  configHash: null,
  lastSyncedAt: null,
  createdAt: 1783308735,
  updatedAt: 1783308735,
  inputs: [
    {
      id: '019f357b-d398-73aa-9062-adc0f927a999',
      priority: 1,
      url: 'rtmp://royaltv.example.com/live/STRM-BX74',
      sourceTimeout: 30,
      comment: null,
    },
  ],
};

@ApiTags('System / Tenant Streams')
@ApiBearerAuth()
@Controller('system/tenant-streams')
export class TenantStreamsController {
  constructor(
    private readonly tenantStreamsService: TenantStreamsService,
    private readonly syncService: TenantStreamSyncService,
  ) {}

  @Post('servers/:serverId/adopt-all')
  @RequirePermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'Adopt every unmanaged stream on a server',
    description:
      'The bulk import for a server that was already in production. Per-stream failures are ' +
      'collected and reported rather than aborting the run.',
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 201,
    description: 'Import result.',
    schema: { example: { adopted: 47, skipped: 1, failed: 0, errors: [] } },
  })
  adoptAll(@CurrentUser() user: AuthUser, @Param('serverId') serverId: string) {
    return this.syncService.adoptAll(serverId, { actorId: user.id });
  }

  @Post('servers/:serverId/sync')
  @RequirePermissions('tenant-streams:sync')
  @ApiOperation({
    summary: "Reconcile a server's streams against our records",
    description:
      'Lists every stream on the server (cursor-paged) and classifies each one: in sync, ' +
      'conflict, missing on the server (pushed), or unmanaged. Streams the server reports as ' +
      'user or remote are ignored, and unmanaged streams are never deleted.',
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Reconcile summary.',
    schema: {
      example: {
        serverId: '019f357b-c211-71a0-9062-adc0f927a111',
        checked: 12,
        inSync: 9,
        pushed: 1,
        conflicts: 1,
        unmanaged: 1,
        skipped: 0,
        failed: 0,
      },
    },
  })
  syncServer(@CurrentUser() user: AuthUser, @Param('serverId') serverId: string) {
    return this.syncService.reconcileServer(serverId, user.id);
  }

  @Get('servers/:serverId/unmanaged')
  @RequirePermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'List streams on a server with no record here',
    description:
      'Only config-defined streams are listed. adoptable is false when the name is not exactly ' +
      'application/key, since such a stream could not be edited here afterwards.',
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Unmanaged streams.',
    schema: {
      example: [
        {
          name: 'app-restream/legacy-feed',
          namedBy: 'config',
          title: 'Legacy feed',
          disabled: false,
          inputCount: 1,
          adoptable: true,
          reason: null,
        },
      ],
    },
  })
  listUnmanaged(@Param('serverId') serverId: string) {
    return this.syncService.listUnmanaged(serverId);
  }

  @Post('servers/:serverId/adopt')
  @RequirePermissions('tenant-streams:sync')
  @ApiOperation({
    summary: 'Take over an existing server stream',
    description: "Creates a local record from the server's config, already in sync.",
  })
  @ApiParam({ name: 'serverId', description: 'Server UUIDv7' })
  @ApiResponse({ status: 201, description: 'Stream adopted.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Name not adoptable, or already managed here.' })
  adopt(
    @CurrentUser() user: AuthUser,
    @Param('serverId') serverId: string,
    @Body() dto: AdoptStreamDto,
  ) {
    return this.syncService.adoptStream(serverId, dto.name, {
      tenantCustomerId: dto.tenantCustomerId,
      actorId: user.id,
    });
  }

  @Get()
  @RequirePermissions('tenant-streams:list')
  @ApiOperation({
    summary: 'List tenant streams',
    description:
      'Paginated, searchable, filterable list. Filters: server, customer, status, syncStatus, ' +
      'disabled. Defaults to excluding deleted rows unless status=DELETED is requested.',
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
  findAll(@Query() query: TenantStreamListQueryDto) {
    return this.tenantStreamsService.findAll(query);
  }

  @Get(':id')
  @RequirePermissions('tenant-streams:view')
  @ApiOperation({ summary: 'Get a tenant stream by id' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream detail.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  findOne(@Param('id') id: string) {
    return this.tenantStreamsService.findOne(id);
  }

  @Post()
  @RequirePermissions('tenant-streams:create')
  @ApiOperation({
    summary: 'Create a tenant stream',
    description:
      'The server-side name is derived as applicationName/streamKey and is not accepted from ' +
      'the client. Input order defines failover priority. protocols.whitelist is a mode switch: ' +
      'true allows only the enabled protocols, false forbids them.',
  })
  @ApiResponse({ status: 201, description: 'Stream created.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({
    status: 400,
    description: 'Server or customer not in this business, or the name already exists on the server.',
  })
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTenantStreamDto) {
    return this.tenantStreamsService.create(dto, user.id);
  }

  @Patch(':id')
  @RequirePermissions('tenant-streams:update')
  @ApiOperation({
    summary: 'Update a tenant stream',
    description:
      'applicationName and streamKey cannot be changed here - that is a rename, which deletes ' +
      'and recreates the stream on the server. Changing the server is a transfer. Supplying ' +
      'inputs replaces the whole list.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream updated.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'Server change attempted, or stream mid-operation.' })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTenantStreamDto,
  ) {
    return this.tenantStreamsService.update(id, dto, user.id);
  }

  @Get(':id/view')
  @RequirePermissions('tenant-streams:view')
  @ApiOperation({
    summary: 'Live view of a stream',
    description:
      'Stored config plus runtime stats and the publish/playback URLs for the enabled protocols.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream view.' })
  view(@Param('id') id: string) {
    return this.syncService.viewStream(id);
  }

  @Get(':id/sessions')
  @RequirePermissions('tenant-streams:view_sessions')
  @ApiOperation({
    summary: 'Play sessions for a stream',
    description: 'Read live from the server and filtered to this stream; nothing is stored.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Active sessions.' })
  sessions(@Param('id') id: string) {
    return this.syncService.streamSessions(id);
  }

  @Post(':id/reload')
  @RequirePermissions('tenant-streams:reload')
  @ApiOperation({
    summary: 'Reload a stream by disabling and re-enabling it',
    description: 'Disables, waits 1 second, re-enables. Viewers are interrupted.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Reloaded.', schema: { example: { success: true, gapMs: 1000 } } })
  reload(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.syncService.reloadStream(id, user.id);
  }

  @Post(':id/rename')
  @RequirePermissions('tenant-streams:rename')
  @ApiOperation({
    summary: 'Rename a stream (destructive)',
    description:
      'Flussonic has no rename: the stream is created under the new name and deleted under the ' +
      'old one, which disconnects every viewer on the old name. Create-then-delete order means a ' +
      'partial failure leaves the stream under both names, flagged CONFLICT, rather than under ' +
      'neither. Every step is recorded in the stream operations log.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({
    status: 200,
    description: 'Rename outcome. `warning` is set when the old name could not be removed.',
    schema: { example: { renamed: true, stream: TENANT_STREAM_EXAMPLE } },
  })
  @ApiResponse({ status: 400, description: 'New name taken, server unreachable, or mid-operation.' })
  rename(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: RenameStreamDto,
  ) {
    return this.syncService.renameStream(id, dto, user.id);
  }

  @Post(':id/enable')
  @RequirePermissions('tenant-streams:enable')
  @ApiOperation({ summary: 'Enable a stream (clears the disabled flag)' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream enabled.', schema: { example: TENANT_STREAM_EXAMPLE } })
  enable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.setDisabled(id, false, user.id);
  }

  @Post(':id/disable')
  @RequirePermissions('tenant-streams:disable')
  @ApiOperation({ summary: 'Disable a stream (sets the disabled flag)' })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream disabled.', schema: { example: TENANT_STREAM_EXAMPLE } })
  disable(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.setDisabled(id, true, user.id);
  }

  @Delete(':id')
  @RequirePermissions('tenant-streams:delete')
  @ApiOperation({
    summary: 'Soft-delete a tenant stream',
    description: 'Sets status=DELETED and records deletedAt/deletedBy; recoverable via restore.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream deleted.', schema: { example: { success: true } } })
  @ApiResponse({ status: 404, description: 'Stream not found.' })
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.remove(id, user.id);
  }

  @Patch(':id/restore')
  @RequirePermissions('tenant-streams:restore')
  @ApiOperation({
    summary: 'Restore a soft-deleted tenant stream',
    description: 'Re-checks that the name is still free on the server before restoring.',
  })
  @ApiParam({ name: 'id', description: 'Stream UUIDv7' })
  @ApiResponse({ status: 200, description: 'Stream restored.', schema: { example: TENANT_STREAM_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'The name was taken while the stream was deleted.' })
  @ApiResponse({ status: 404, description: 'Stream not found or not deleted.' })
  restore(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tenantStreamsService.restore(id, user.id);
  }
}
