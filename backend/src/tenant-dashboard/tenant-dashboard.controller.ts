import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { Public } from '../common/decorators/public.decorator';
import { RequireTenantPermissions } from '../common/decorators/require-tenant-permissions.decorator';
import { CurrentTenantUser, TenantAuthUser } from '../common/decorators/current-tenant-user.decorator';
import { TenantJwtAuthGuard } from '../common/guards/tenant-jwt-auth.guard';
import { TenantPermissionsGuard } from '../common/guards/tenant-permissions.guard';
import { DashboardRangeQueryDto } from '../common/dto/dashboard-range.dto';
import { TenantDashboardService } from './tenant-dashboard.service';

@ApiTags('Tenant / Dashboard')
@ApiBearerAuth()
@Public()
@UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard)
@Controller('tenant/dashboard')
export class TenantDashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: TenantDashboardService,
  ) {}

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

  @Get('overview')
  @RequireTenantPermissions('tenant-dashboard:view')
  @ApiOperation({
    summary: 'Tenant dashboard insights',
    description:
      'Buckets for the range (30d: 30 days, 90d: 13 weeks, 12m: 12 months, in the app timezone) and one ' +
      'section per area. A section is null when the caller lacks its permission: billing ' +
      '(tenant-invoices:list), streams (tenant-streams:list; servers needs tenant-streaming-servers:list), ' +
      'customers (tenant-customers:view), events (tenant-stream-events:list), incomeExpense ' +
      '(tenant-income-expenses:list). Series align with buckets; money is in the business currency.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard insights.',
    schema: {
      example: {
        range: '30d',
        generatedAt: 1789390800,
        buckets: [{ key: '2026-09-14', label: '14 Sep', start: 1789324200, end: 1789410600 }],
        billing: { currency: 'INR', collected: 12500, collectedSeries: [500], outstanding: 3200, openCount: 4, overdueAmount: 1000, overdueCount: 1, invoiceStatus: [{ status: 'PAID', count: 9 }], expiringSoon: [] },
        streams: { total: 42, enabled: 38, billingOff: 3, disabledByUser: 1, exempt: 0, perServer: [{ name: 'Chennai-01', enabled: 20, disabled: 2 }], servers: { total: 3, connected: 2, unreachable: 1, unauthorized: 0, unknown: 0, attention: [] } },
        customers: { total: 120, active: 110, newInRange: 6, newSeries: [1], withActiveBill: 95, withoutActiveBill: 25 },
        events: { total: 840, series: { SOURCE: [10], STREAM: [4], VIEWER: [0] }, alerts: { sent: 12, failed: 0, cooldown: 3, noMailConfig: 0 } },
        incomeExpense: { currency: 'INR', income: 12500, expense: 4000, net: 8500, incomeSeries: [500], expenseSeries: [0] },
      },
    },
  })
  overview(@CurrentTenantUser() user: TenantAuthUser, @Query() query: DashboardRangeQueryDto) {
    return this.dashboard.overview(user, query.range);
  }
}
