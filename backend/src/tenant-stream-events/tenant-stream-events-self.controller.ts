import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';
import { TenantStreamEventsService } from './tenant-stream-events.service';
import { TenantEventAlertsService } from './tenant-event-alerts.service';
import {
  CreateEventAlertRuleDto,
  EventAlertRuleListQueryDto,
  StreamEventListQueryDto,
  UpdateEventAlertRuleDto,
} from './dto/stream-events.dto';

const EVENT_EXAMPLE = {
  id: '019f3d90-7777-7aaa-9062-adc0f927a584',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  tenantFlussonicServerId: '019f357b-5555-71a0-9062-adc0f927a584',
  tenantStreamId: '019f357b-6666-71a0-9062-adc0f927a584',
  tenantCustomerId: '019f357b-c999-71a0-9062-adc0f927a584',
  event: 'stream_closed',
  media: 'live/news_hd',
  occurredAt: 1789308000,
  payload: { event: 'stream_closed', media: 'live/news_hd', reason: 'source_lost', utc_ms: 1789308000123 },
  emailStatus: 'SENT',
  emailError: null,
  createdAt: 1789308001,
  server: { id: '019f357b-5555-71a0-9062-adc0f927a584', name: 'Chennai-01' },
  stream: { id: '019f357b-6666-71a0-9062-adc0f927a584', name: 'live/news_hd', title: 'News HD' },
  customer: { id: '019f357b-c999-71a0-9062-adc0f927a584', customerCode: 'CUS001', name: 'Ravi Kumar' },
};

const RULE_EXAMPLE = {
  id: '019f3d90-8888-7aaa-9062-adc0f927a584',
  systemCode: 'EAR-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  name: 'Source lost',
  events: ['source_closed', 'stream_closed'],
  serverIds: [],
  streamIds: [],
  customerIds: [],
  recipients: ['noc@example.com'],
  customerRecipients: 'SERVER_CUSTOMERS',
  cooldownMinutes: 15,
  status: 'ACTIVE',
  lastTriggeredAt: 1789308001,
  createdAt: 1789300000,
  updatedAt: 1789300000,
};

@ApiTags('Tenant / Stream Events')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/stream-events')
export class TenantStreamEventsSelfController {
  constructor(private readonly events: TenantStreamEventsService) {}

  @Get('options')
  @RequireTenantPermissions('tenant-stream-events:list')
  @ApiOperation({ summary: 'Servers, streams and event names for the event log filters' })
  @ApiResponse({ status: 200, description: 'Filter options.' })
  options(@CurrentTenantUser() user: TenantAuthUser) {
    return this.events.optionsForTenantUser(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-stream-events:list')
  @ApiOperation({
    summary: 'Events your streaming servers sent',
    description: 'Newest first; kept 30 days. emailStatus says what happened to the alerts the event matched.',
  })
  @ApiResponse({ status: 200, description: 'Paginated events.', schema: { example: { items: [EVENT_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } } })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: StreamEventListQueryDto) {
    return this.events.listForTenantUser(user.id, query);
  }
}

@ApiTags('Tenant / Event Alerts')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/event-alerts')
export class TenantEventAlertsSelfController {
  constructor(private readonly alerts: TenantEventAlertsService) {}

  @Get('options')
  @RequireTenantPermissions('tenant-event-alerts:list')
  @ApiOperation({ summary: 'Event names, servers, streams and customers for the alert rule form' })
  @ApiResponse({ status: 200, description: 'Form options, with mailConfigured.' })
  options(@CurrentTenantUser() user: TenantAuthUser) {
    return this.alerts.optionsForTenantUser(user.id);
  }

  @Get()
  @RequireTenantPermissions('tenant-event-alerts:list')
  @ApiOperation({ summary: 'Your stream event alert rules' })
  @ApiResponse({ status: 200, description: 'Paginated rules.', schema: { example: { items: [RULE_EXAMPLE], meta: { total: 1, page: 1, limit: 20, totalPages: 1 } } } })
  findAll(@CurrentTenantUser() user: TenantAuthUser, @Query() query: EventAlertRuleListQueryDto) {
    return this.alerts.listForTenantUser(user.id, query);
  }

  @Get(':id')
  @RequireTenantPermissions('tenant-event-alerts:view')
  @ApiOperation({ summary: 'One alert rule' })
  @ApiParam({ name: 'id', description: 'Rule UUIDv7' })
  @ApiResponse({ status: 200, description: 'Rule.', schema: { example: RULE_EXAMPLE } })
  findOne(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.alerts.findOneForTenantUser(user.id, id);
  }

  @Post()
  @RequireTenantPermissions('tenant-event-alerts:create')
  @ApiOperation({
    summary: 'Create an alert rule',
    description:
      'Emails recipients when any of its events happens within scope. customerRecipients also emails, by Bcc, ' +
      'NONE, the STREAM_OWNER, or SERVER_CUSTOMERS (the owner plus every customer actively assigned to the ' +
      'stream\'s server, with an email address). ' +
      'Empty scope lists mean all; a rule with no events never fires. cooldownMinutes limits emails per stream.',
  })
  @ApiResponse({ status: 201, description: 'Rule created.', schema: { example: RULE_EXAMPLE } })
  @ApiResponse({ status: 400, description: 'No recipient, or a scoped id outside your business.' })
  create(@CurrentTenantUser() user: TenantAuthUser, @Body() dto: CreateEventAlertRuleDto) {
    return this.alerts.createForTenantUser(user.id, dto);
  }

  @Patch(':id')
  @RequireTenantPermissions('tenant-event-alerts:update')
  @ApiOperation({ summary: 'Update an alert rule' })
  @ApiParam({ name: 'id', description: 'Rule UUIDv7' })
  @ApiResponse({ status: 200, description: 'Rule updated.', schema: { example: RULE_EXAMPLE } })
  update(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string, @Body() dto: UpdateEventAlertRuleDto) {
    return this.alerts.updateForTenantUser(user.id, id, dto);
  }

  @Post(':id/test')
  @RequireTenantPermissions('tenant-event-alerts:update')
  @ApiOperation({ summary: 'Send a sample alert to the rule\'s recipient addresses' })
  @ApiParam({ name: 'id', description: 'Rule UUIDv7' })
  @ApiResponse({ status: 201, description: 'Sent.', schema: { example: { success: true, recipients: ['noc@example.com'] } } })
  @ApiResponse({ status: 400, description: 'No mail config, no recipient addresses, or the send failed.' })
  test(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.alerts.testForTenantUser(user.id, id);
  }

  @Delete(':id')
  @RequireTenantPermissions('tenant-event-alerts:delete')
  @ApiOperation({ summary: 'Delete an alert rule' })
  @ApiParam({ name: 'id', description: 'Rule UUIDv7' })
  @ApiResponse({ status: 200, description: 'Rule deleted.', schema: { example: { success: true } } })
  remove(@CurrentTenantUser() user: TenantAuthUser, @Param('id') id: string) {
    return this.alerts.removeForTenantUser(user.id, id);
  }
}
