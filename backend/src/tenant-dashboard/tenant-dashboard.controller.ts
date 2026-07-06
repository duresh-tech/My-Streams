import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';

@ApiTags('Tenant / Dashboard')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/dashboard')
export class TenantDashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequireTenantPermissions('tenant-dashboard:view')
  @ApiOperation({
    summary: 'Tenant dashboard stats',
    description: "Count of the authenticated tenant user's own active business mappings.",
  })
  @ApiResponse({
    status: 200,
    description: 'Active mapped-business count for this tenant user.',
    schema: { example: { businesses: 3 } },
  })
  async stats(@CurrentTenantUser() user: TenantAuthUser) {
    const businesses = await this.prisma.tenantMappedBusiness.count({
      where: { tenantUserId: user.id, status: 'ACTIVE' },
    });
    return { businesses };
  }
}
