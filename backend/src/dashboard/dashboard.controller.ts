import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';
import { DashboardRangeQueryDto } from '../common/dto/dashboard-range.dto';
import { DashboardService } from './dashboard.service';

@ApiTags('System / Dashboard')
@ApiBearerAuth()
@Controller('system/dashboard')
export class DashboardController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dashboard: DashboardService,
  ) {}

  @Get()
  @RequirePermissions('dashboard:view')
  @ApiOperation({
    summary: 'Dashboard stats',
    description: 'Aggregate counts for the system dashboard cards.',
  })
  @ApiResponse({
    status: 200,
    description: 'Counts of users, roles and permissions.',
    schema: {
      example: {
        users: 5,
        activeUsers: 4,
        roles: 2,
        permissions: 14,
        activeSessions: 3,
      },
    },
  })
  async stats() {
    const [users, activeUsers, roles, permissions, activeSessions] =
      await this.prisma.$transaction([
        this.prisma.systemUser.count({ where: { status: { not: 'DELETED' } } }),
        this.prisma.systemUser.count({ where: { status: 'ACTIVE' } }),
        this.prisma.role.count({ where: { status: { not: 'DELETED' } } }),
        this.prisma.permission.count({ where: { status: { not: 'DELETED' } } }),
        this.prisma.refreshToken.count({
          where: { revokedAt: null, expiresAt: { gt: Math.floor(Date.now() / 1000) } },
        }),
      ]);
    return { users, activeUsers, roles, permissions, activeSessions };
  }

  @Get('overview')
  @RequirePermissions('dashboard:view')
  @ApiOperation({
    summary: 'System dashboard insights across all tenants',
    description:
      'Buckets for the range (30d: 30 days, 90d: 13 weeks, 12m: 12 months, in the app timezone) with ' +
      'growth, infrastructure, billing (one entry per currency - never summed across currencies) and access. ' +
      'Series align with buckets. systemUsersSeries / tenantUsersSeries count distinct users who started ' +
      'or renewed a session in each bucket.',
  })
  @ApiResponse({
    status: 200,
    description: 'Dashboard insights.',
    schema: {
      example: {
        range: '12m',
        generatedAt: 1789390800,
        buckets: [{ key: '2026-09', label: 'Sep 26', start: 1788201000, end: 1790793000 }],
        growth: { businesses: 14, tenantUsers: 40, customers: 1200, businessesSeries: [2], tenantUsersSeries: [5], customersSeries: [80], topBusinesses: [{ id: '019f357b-c211-71a0-9062-adc0f927a584', name: 'Acme Streams', customers: 400, streams: 610 }] },
        infrastructure: { servers: { total: 9, active: 8, connected: 7, unreachable: 1, unauthorized: 0, unknown: 1 }, streams: { total: 2400, enabled: 2210, billingOff: 120, disabled: 190 }, attention: [] },
        billing: [{ currency: 'INR', invoices: 320, invoicesSeries: [320], collected: 845000, collectedSeries: [845000], outstanding: 42000 }],
        access: { users: 5, activeUsers: 4, roles: 3, permissions: 180, activeSessions: 2, activeTenantSessions: 18, activeCustomerSessions: 240, systemUsersSeries: [3], tenantUsersSeries: [16] },
      },
    },
  })
  overview(@Query() query: DashboardRangeQueryDto) {
    return this.dashboard.overview(query.range);
  }
}
