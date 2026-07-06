import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { newId, newSystemCode, now } from '../common/utils/id.util';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { JwtPayload } from './strategies/jwt.strategy';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

const DEFAULT_ROLE_KEY = 'SYSTEM_USER';
const FIRST_USER_ROLE_KEY = 'SUPER_ADMIN';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.systemUser.findFirst({
      where: { OR: [{ username: dto.username }, { email: dto.email }] },
    });
    if (existing) {
      throw new ConflictException('Username or email already in use');
    }

    // First registered user becomes SUPER_ADMIN; the rest get SYSTEM_USER.
    const userCount = await this.prisma.systemUser.count();
    const roleKey = userCount === 0 ? FIRST_USER_ROLE_KEY : DEFAULT_ROLE_KEY;
    const role = await this.prisma.role.findUnique({ where: { roleKey } });
    if (!role) {
      throw new ConflictException(
        `Role "${roleKey}" not found. Run the database seed first (npm run seed).`,
      );
    }

    const timestamp = now();
    const user = await this.prisma.systemUser.create({
      data: {
        id: newId(),
        systemCode: newSystemCode('USR'),
        fName: dto.fName,
        username: dto.username,
        email: dto.email,
        passwordHash: await argon2.hash(dto.password, {
          type: argon2.argon2id,
        }),
        roleId: role.id,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      include: { role: true },
    });

    return this.sanitizeUser(user);
  }

  async login(dto: LoginDto, deviceType: string) {
    const user = await this.prisma.systemUser.findFirst({
      where: {
        OR: [{ username: dto.username }, { email: dto.username }],
        status: { not: 'DELETED' },
      },
      include: {
        role: { include: { rolePermissions: { include: { permission: true } } } },
      },
    });

    // Verify against a dummy hash on unknown users to keep timing constant.
    const passwordOk = user
      ? await argon2.verify(user.passwordHash, dto.password).catch(() => false)
      : false;
    if (!user || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${user.status.toLowerCase()}`);
    }

    const tokens = await this.issueTokens(user.id, user.username, user.role.roleKey, deviceType);
    const permissions = user.role.rolePermissions
      .filter((rp) => rp.permission.status === 'ACTIVE')
      .map((rp) => rp.permission.permissionKey);

    return {
      user: this.sanitizeUser(user),
      permissions,
      redirectTo: '/system/dashboard',
      ...tokens,
    };
  }

  async refresh(refreshToken: string, deviceType: string) {
    let payload: JwtPayload;
    try {
      payload = await this.jwt.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.refreshToken.findFirst({
      where: { tokenHash, userId: payload.sub, revokedAt: null },
    });
    if (!stored || Number(stored.expiresAt) < now()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    const user = await this.prisma.systemUser.findUnique({
      where: { id: payload.sub },
      include: { role: true },
    });
    if (!user || user.status !== 'ACTIVE') {
      throw new UnauthorizedException('User not found or not active');
    }

    // Rotate: revoke the used token, issue a fresh pair.
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: now() },
    });

    return this.issueTokens(user.id, user.username, user.role.roleKey, deviceType);
  }

  async logout(userId: string, refreshToken?: string) {
    if (refreshToken) {
      await this.prisma.refreshToken.updateMany({
        where: { userId, tokenHash: this.hashToken(refreshToken), revokedAt: null },
        data: { revokedAt: now() },
      });
    } else {
      await this.prisma.refreshToken.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now() },
      });
    }
    return { success: true };
  }

  private async issueTokens(
    userId: string,
    username: string,
    roleKey: string,
    deviceType: string,
  ): Promise<AuthTokens> {
    const accessPayload: JwtPayload = { sub: userId, username, roleKey, type: 'access' };
    const refreshPayload: JwtPayload = { sub: userId, username, roleKey, type: 'refresh' };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
    });

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.refreshToken.create({
      data: {
        id: newId(),
        userId,
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
