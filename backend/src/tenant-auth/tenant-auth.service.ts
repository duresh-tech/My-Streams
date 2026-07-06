import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { newId, now } from '../common/utils/id.util';
import { TenantLoginDto } from './dto/tenant-auth.dto';
import { TenantJwtPayload } from './strategies/tenant-jwt.strategy';

export interface TenantAuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

@Injectable()
export class TenantAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: TenantLoginDto, deviceType: string) {
    const user = await this.prisma.tenantUser.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.username }],
        status: { not: 'DELETED' },
      },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });

    const passwordOk = user
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : false;
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }
    if (!user.role.visibleToTenants) {
      throw new UnauthorizedException('Role is not permitted to log in as a tenant');
    }

    const tokens = await this.issueTokens(user.id, user.username, user.role.roleKey, deviceType);
    const permissions = user.role.rolePermissions
      .filter((rp) => rp.permission.status === 'ACTIVE')
      .map((rp) => rp.permission.permissionKey);

    return {
      user: this.sanitizeUser(user),
      permissions,
      redirectTo: '/tenant/dashboard',
      ...tokens,
    };
  }

  /**
   * Issues a tenant session for the given tenant user without a password —
   * used by the system-admin "Login as" feature (POST
   * /system/tenant-users/:id/login-as), which is itself gated by the
   * tenant-users:login-as system permission, not this service.
   */
  async loginAs(tenantUserId: string, deviceType: string) {
    const user = await this.prisma.tenantUser.findFirst({
      where: { id: tenantUserId, status: { not: 'DELETED' } },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });
    if (!user) throw new NotFoundException('Tenant user not found');
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }
    if (!user.role.visibleToTenants) {
      throw new UnauthorizedException('Role is not permitted to log in as a tenant');
    }

    const tokens = await this.issueTokens(user.id, user.username, user.role.roleKey, deviceType);
    const permissions = user.role.rolePermissions
      .filter((rp) => rp.permission.status === 'ACTIVE')
      .map((rp) => rp.permission.permissionKey);

    return {
      user: this.sanitizeUser(user),
      permissions,
      redirectTo: '/tenant/dashboard',
      ...tokens,
    };
  }

  async refresh(refreshToken: string, deviceType: string) {
    let payload: TenantJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<TenantJwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.tenantRefreshToken.findFirst({
      where: { tokenHash, tenantUserId: payload.sub, revokedAt: null },
    });
    if (!stored || Number(stored.expiresAt) < now()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    const user = await this.prisma.tenantUser.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or not active');
    }
    if (!user.role.visibleToTenants) {
      throw new UnauthorizedException('Role is not permitted to log in as a tenant');
    }

    await this.prisma.tenantRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: now() },
    });

    return this.issueTokens(user.id, user.username, user.role.roleKey, deviceType);
  }

  async logout(tenantUserId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.tenantRefreshToken.updateMany({
        where: { tenantUserId, tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: now() },
      });
    } else {
      await this.prisma.tenantRefreshToken.updateMany({
        where: { tenantUserId, revokedAt: null },
        data: { revokedAt: now() },
      });
    }
    return { success: true };
  }

  private async issueTokens(
    tenantUserId: string,
    username: string,
    roleKey: string,
    deviceType: string,
  ): Promise<TenantAuthTokens> {
    const accessPayload: TenantJwtPayload = { sub: tenantUserId, username, roleKey, type: 'access' };
    const refreshPayload: TenantJwtPayload = { sub: tenantUserId, username, roleKey, type: 'refresh' };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.tenantRefreshToken.create({
      data: {
        id: newId(),
        tenantUserId,
        tokenHash: this.hashToken(refreshToken),
        deviceType,
        expiresAt: decoded.exp,
        createdAt: now(),
      },
    });

    return {
      accessToken,
      refreshToken,
      csrfToken: randomBytes(24).toString('hex'),
    };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private sanitizeUser(user: any) {
    const { passwordHash, role, ...rest } = user;
    return {
      ...rest,
      role: role
        ? { id: role.id, roleKey: role.roleKey, displayName: role.displayName }
        : undefined,
    };
  }
}
