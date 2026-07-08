import { Module } from '@nestjs/common';
import { TenantUsersController } from './tenant-users.controller';
import { TenantUsersSelfController } from './tenant-users-self.controller';
import { TenantUsersService } from './tenant-users.service';
import { TenantAuthModule } from '../tenant-auth/tenant-auth.module';

@Module({
  imports: [TenantAuthModule],
  controllers: [TenantUsersController, TenantUsersSelfController],
  providers: [TenantUsersService],
  exports: [TenantUsersService],
})
export class TenantUsersModule {}
