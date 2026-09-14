import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { newId, now } from '../common/utils/id.util';
import { CustomerLoginDto } from './dto/customer-auth.dto';
import { CustomerJwtPayload } from './strategies/customer-jwt.strategy';

export interface CustomerAuthTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
}

const CUSTOMER_SELECT = {
  id: true,
  systemCode: true,
  tenantBusinessId: true,
  customerCode: true,
  username: true,
  fName: true,
  lName: true,
  email: true,
  primaryMobile: true,
  status: true,
  allowPortalAccess: true,
  passwordHash: true,
};

@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async login(dto: CustomerLoginDto, deviceType: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { username: dto.username, status: { not: 'DELETED' } },
      select: CUSTOMER_SELECT,
    });

    // Verified even when no customer matched, so a missing username and a wrong
    // password take the same time and the response cannot be used to enumerate
    // accounts.
    const passwordOk = customer?.passwordHash
      ? await argon2.verify(customer.passwordHash, dto.password).catch(() => false)
      : await argon2
          .hash(dto.password, { type: argon2.argon2id })
          .then(() => false)
          .catch(() => false);

    if (!customer || !passwordOk) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (customer.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${customer.status.toLowerCase()}`);
    }
    if (!customer.allowPortalAccess) {
      throw new UnauthorizedException('Portal access is disabled for this account');
    }

    const tokens = await this.issueTokens(customer.id, customer.username ?? '', deviceType, false);
    return { customer: this.sanitize(customer), redirectTo: '/customer/streams', ...tokens };
  }

  /**
   * Issues a customer session without a password, for the tenant-admin
   * "Login as customer" feature. Gated by tenant-customers:login-as on the
   * calling route, not here.
   *
   * The session is marked `impersonated` so the portal can say so - a support
   * agent acting as a customer should be visible, not indistinguishable from
   * the customer themselves.
   */
  async loginAs(tenantCustomerId: string, tenantBusinessId: string, deviceType: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id: tenantCustomerId, status: { not: 'DELETED' } },
      select: CUSTOMER_SELECT,
    });
    if (!customer) throw new NotFoundException('Customer not found');
    // A tenant admin may only impersonate a customer of their own business.
    if (customer.tenantBusinessId !== tenantBusinessId) {
      throw new ForbiddenException('This customer belongs to another business');
    }
    if (customer.status !== 'ACTIVE') {
      throw new UnauthorizedException(`Account is ${customer.status.toLowerCase()}`);
    }
    if (!customer.username) {
      throw new ForbiddenException('This customer has no portal username yet');
    }

    const tokens = await this.issueTokens(customer.id, customer.username, deviceType, true);
    return {
      customer: this.sanitize(customer),
      impersonated: true,
      redirectTo: '/customer/streams',
      ...tokens,
    };
  }

  async refresh(refreshToken: string, deviceType: string) {
    let payload: CustomerJwtPayload;
    try {
      payload = await this.jwt.verifyAsync<CustomerJwtPayload>(refreshToken, {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
    if (payload.type !== 'refresh' || payload.scope !== 'customer') {
      throw new UnauthorizedException('Invalid token type');
    }

    const tokenHash = this.hashToken(refreshToken);
    const stored = await this.prisma.tenantCustomerRefreshToken.findFirst({
      where: { tokenHash, tenantCustomerId: payload.sub, revokedAt: null },
    });
    if (!stored || Number(stored.expiresAt) < now()) {
      throw new UnauthorizedException('Refresh token revoked or expired');
    }

    const customer = await this.prisma.tenantCustomer.findUnique({
      where: { id: payload.sub },
      select: CUSTOMER_SELECT,
    });
    if (!customer || customer.status !== 'ACTIVE' || !customer.allowPortalAccess) {
      throw new UnauthorizedException('Account not found, not active, or portal access disabled');
    }

    // Single-use: the presented token is revoked before a new one is issued, so
    // a stolen refresh token cannot be replayed after the customer has used it.
    await this.prisma.tenantCustomerRefreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: now() },
    });

    return this.issueTokens(
      customer.id,
      customer.username ?? '',
      deviceType,
      payload.impersonated === true,
    );
  }

  async logout(tenantCustomerId: string, refreshToken?: string) {
    await this.prisma.tenantCustomerRefreshToken.updateMany({
      where: {
        tenantCustomerId,
        ...(refreshToken ? { tokenHash: this.hashToken(refreshToken) } : {}),
        revokedAt: null,
      },
      data: { revokedAt: now() },
    });
    return { success: true };
  }

  async me(tenantCustomerId: string) {
    const customer = await this.prisma.tenantCustomer.findFirst({
      where: { id: tenantCustomerId, status: { not: 'DELETED' } },
      select: CUSTOMER_SELECT,
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.sanitize(customer);
  }

  private async issueTokens(
    tenantCustomerId: string,
    username: string,
    deviceType: string,
    impersonated: boolean,
  ): Promise<CustomerAuthTokens> {
    const base = { sub: tenantCustomerId, username, scope: 'customer' as const, impersonated };
    const accessToken = await this.jwt.signAsync(
      { ...base, type: 'access' } satisfies CustomerJwtPayload,
      {
        secret: this.config.getOrThrow('JWT_ACCESS_SECRET'),
        expiresIn: this.config.get('JWT_ACCESS_EXPIRES_IN', '15m'),
      },
    );
    const refreshToken = await this.jwt.signAsync(
      { ...base, type: 'refresh' } satisfies CustomerJwtPayload,
      {
        secret: this.config.getOrThrow('JWT_REFRESH_SECRET'),
        expiresIn: this.config.get('JWT_REFRESH_EXPIRES_IN', '7d'),
      },
    );

    const decoded = this.jwt.decode(refreshToken) as { exp: number };
    await this.prisma.tenantCustomerRefreshToken.create({
      data: {
        id: newId(),
        tenantCustomerId,
        tokenHash: this.hashToken(refreshToken),
        deviceType,
        expiresAt: decoded.exp,
        createdAt: now(),
      },
    });

    return { accessToken, refreshToken, csrfToken: randomBytes(24).toString('hex') };
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** The password hash never leaves the service. */
  private sanitize(customer: { passwordHash: string | null } & Record<string, unknown>) {
    const { passwordHash, ...rest } = customer;
    return { ...rest, hasPassword: !!passwordHash };
  }
}
