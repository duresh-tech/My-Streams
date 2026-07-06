import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PrismaService } from '../prisma/prisma.service';
import { RequirePermissions } from '../common/decorators/permissions.decorator';

@ApiTags('System / Dashboard')
@ApiBearerAuth()
@Controller({ path: 'system/dashboard', version: '1' })
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @RequirePermissions('dashboard:view')
  @ApiOperation({
    summary: 'Dashboard stats',
    description: 'Aggregate counts for the system dashboard cards.',
  })
  @ApiResponse({ status: 200, description: 'Counts of users, roles and permissions.' })
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
}
