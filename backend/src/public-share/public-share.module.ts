import { Module } from '@nestjs/common';
import { PublicShareController } from './public-share.controller';
import { PublicShareService } from './public-share.service';
import { TenantStreamsModule } from '../tenant-streams/tenant-streams.module';

@Module({
  imports: [TenantStreamsModule],
  controllers: [PublicShareController],
  providers: [PublicShareService],
})
export class PublicShareModule {}
