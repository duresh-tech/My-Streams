import { Module } from '@nestjs/common';
import { TenantUsersController } from './tenant-users.controller';
import { TenantUsersService } from './tenant-users.service';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [TenantAuthModule],
  controllers: [TenantUsersController],
  providers: [TenantUsersService],
  exports: [TenantUsersService],
})
export class TenantUsersModule {}
