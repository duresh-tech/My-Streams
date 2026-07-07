import { Module } from '@nestjs/common';
import { TenantBusinessBranchesController } from './tenant-business-branches.controller';
import { TenantBusinessBranchesSelfController } from './tenant-business-branches-self.controller';
import { TenantBusinessBranchesService } from './tenant-business-branches.service';

@Module({
  controllers: [TenantBusinessBranchesController, TenantBusinessBranchesSelfController],
  providers: [TenantBusinessBranchesService],
  exports: [TenantBusinessBranchesService],
})
export class TenantBusinessBranchesModule {}
