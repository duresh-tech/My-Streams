import { Module } from '@nestjs/common';
import { TenantStreamsController } from './tenant-streams.controller';
import { TenantStreamsSelfController } from './tenant-streams-self.controller';
import { TenantStreamsService } from './tenant-streams.service';
import { TenantStreamSyncService } from './tenant-stream-sync.service';
import { StreamerApiService } from './streamer-api.service';

@Module({
  controllers: [TenantStreamsController, TenantStreamsSelfController],
  providers: [TenantStreamsService, TenantStreamSyncService, StreamerApiService],
  exports: [TenantStreamsService, TenantStreamSyncService, StreamerApiService],
})
export class TenantStreamsModule {}
