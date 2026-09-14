import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';
import { CustomerAuthUser } from '../../common/decorators/current-customer.decorator';

export interface CustomerJwtPayload {
  sub: string;
  username: string;
  /** Marks the token as a customer session, so a tenant token cannot be used here. */
  scope: 'customer';
  impersonated?: boolean;
  type: 'access' | 'refresh';
}

@Injectable()
export class CustomerJwtStrategy extends PassportStrategy(Strategy, 'jwt-customer') {
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

  /**
   * Runs on every customer request. The access check is re-read from the
   * database rather than trusted from the token, so revoking portal access or
   * blocking a customer takes effect immediately instead of at token expiry.
   */
  async validate(payload: CustomerJwtPayload): Promise<CustomerAuthUser> {
    if (payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type');
    }
    // The access secret is shared with tenant/system tokens, so the scope claim
    // is what stops a tenant-user token being replayed against the portal.
    if (payload.scope !== 'customer') {
      throw new UnauthorizedException('Not a customer session');
    }

    const customer = await this.prisma.tenantCustomer.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        tenantBusinessId: true,
        customerCode: true,
        username: true,
        fName: true,
        status: true,
        allowPortalAccess: true,
      },
    });

    if (!customer || customer.status !== 'ACTIVE') {
      throw new UnauthorizedException('Customer not found or not active');
    }
    if (!customer.allowPortalAccess) {
      throw new UnauthorizedException('Portal access is disabled for this account');
    }

    return {
      id: customer.id,
      tenantBusinessId: customer.tenantBusinessId,
      customerCode: customer.customerCode,
      username: customer.username ?? '',
      fName: customer.fName,
      impersonated: payload.impersonated === true,
    };
  }
}
