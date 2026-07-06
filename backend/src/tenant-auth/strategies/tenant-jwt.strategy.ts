import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantAuthUser } from '../../common/decorators/current-tenant-user.decorator';

export interface TenantJwtPayload {
  sub: string;
  username: string;
  roleKey: string;
  type: 'access' | 'refresh';
}

@Injectable()
export class TenantJwtStrategy extends PassportStrategy(Strategy, 'jwt-tenant') {
  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  /** Runs on every authenticated tenant request; resolves fresh role permissions. */
  async validate(payload: TenantJwtPayload): Promise<TenantAuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }

    const user = await this.prisma.tenantUser.findUnique({
      where: { id: payload.sub },
      include: {
        role: {
          include: {
            rolePermissions: { include: { permission: true } },
          },
        },
      },
    });

    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or not active');
    }
    if (!user.role.visibleToTenants) {
      throw new UnauthorizedException('Role is not permitted to log in as a tenant');
    }

    const permissions = user.role.rolePermissions
      .filter((rp) => rp.permission.status === 'ACTIVE')
      .map((rp) => rp.permission.permissionKey);

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      roleId: user.roleId,
      roleKey: user.role.roleKey,
      permissions,
    };
  }
}
