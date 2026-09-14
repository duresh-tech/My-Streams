import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { SkipDeviceHeader } from '../common/decorators/skip-device-header.decorator';
import { TenantStreamEventsService } from './tenant-stream-events.service';

/**
 * Where streaming servers post their events. Authenticated by the secret token
 * in the URL, which the event sink was configured with - not by a user session,
 * the device header or rate limiting, none of which a server can take part in.
 */
@ApiTags('Webhooks / Streaming server')
@Public()
@SkipDeviceHeader()
@SkipThrottle()
@Controller('webhooks/flussonic')
export class StreamServerWebhookController {
  constructor(private readonly events: TenantStreamEventsService) {}

  @Post(':serverId/:token')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Receive events from a streaming server',
    description:
      'Called by the server\'s event sink. Accepts one event, an array of events, or { events: [...] }; ' +
      'entries without an `event` name are ignored, at most 1000 per request. Events are stored at once ' +
      'and alert emails are worked out afterwards. Returns 404 for an unknown server or a wrong token.',
  })
  @ApiParam({ name: 'serverId', description: 'Streaming server UUIDv7' })
  @ApiParam({ name: 'token', description: 'The server\'s webhook secret' })
  @ApiResponse({ status: 200, description: 'Events accepted.', schema: { example: { accepted: 3 } } })
  @ApiResponse({ status: 404, description: 'Unknown server or wrong token.' })
  receive(@Param('serverId') serverId: string, @Param('token') token: string, @Body() body: unknown) {
    return this.events.ingest(serverId, token, body);
  }
}
