import { Module } from '@nestjs/common';
import { TenantStreamsModule } from '../tenant-streams/tenant-streams.module';
import { TenantFlussonicServersController } from './tenant-flussonic-servers.controller';
import { TenantFlussonicServersSelfController } from './tenant-flussonic-servers-self.controller';
import { TenantFlussonicServersService } from './tenant-flussonic-servers.service';
import { EventSinkService } from './event-sink.service';

@Module({
  // For StreamerApiService, the shared HTTP client for a server's own API.
  imports: [TenantStreamsModule],
  controllers: [TenantFlussonicServersController, TenantFlussonicServersSelfController],
  providers: [TenantFlussonicServersService, EventSinkService],
  exports: [TenantFlussonicServersService],
})
export class TenantFlussonicServersModule {}
