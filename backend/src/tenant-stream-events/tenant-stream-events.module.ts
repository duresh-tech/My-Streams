import { Module } from '@nestjs/common';
import { StreamServerWebhookController } from './stream-server-webhook.controller';
import {
  TenantEventAlertsSelfController,
  TenantStreamEventsSelfController,
} from './tenant-stream-events-self.controller';
import { TenantStreamEventsService } from './tenant-stream-events.service';
import { TenantEventAlertsService } from './tenant-event-alerts.service';

/** Stream events from streaming servers, their 30-day log, and email alert rules. */
@Module({
  controllers: [StreamServerWebhookController, TenantStreamEventsSelfController, TenantEventAlertsSelfController],
  providers: [TenantStreamEventsService, TenantEventAlertsService],
})
export class TenantStreamEventsModule {}
