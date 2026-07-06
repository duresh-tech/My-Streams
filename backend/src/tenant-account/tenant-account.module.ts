import { Module } from '@nestjs/common';
import { TenantAccountController } from './tenant-account.controller';
import { TenantAccountService } from './tenant-account.service';

@Module({
  controllers: [TenantAccountController],
  providers: [TenantAccountService],
})
export class TenantAccountModule {}
