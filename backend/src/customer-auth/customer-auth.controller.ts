import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { CustomerAuthService } from './customer-auth.service';
import { CustomerLoginDto } from './dto/customer-auth.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  CurrentCustomer,
  CustomerAuthUser,
} from '../common/decorators/current-customer.decorator';
import { CustomerJwtAuthGuard } from '../common/guards/customer-jwt-auth.guard';

const CUSTOMER_REFRESH_COOKIE = 'customer_refresh_token';
const CUSTOMER_CSRF_COOKIE = 'customer_csrf_token';

const CUSTOMER_EXAMPLE = {
  id: '019f357b-c211-71a0-9062-adc0f927a222',
  systemCode: 'TNC-MR8NZ6OO-C0CB',
  tenantBusinessId: '019f357b-c211-71a0-9062-adc0f927a584',
  customerCode: 'CUS001',
  username: 'johncustomer',
  fName: 'John',
  lName: null,
  email: 'john@example.com',
  primaryMobile: '9999999999',
  status: 'ACTIVE',
  allowPortalAccess: true,
  hasPassword: true,
};

@ApiTags('Customer / Auth')
@Controller('customer/auth')
export class CustomerAuthController {
  constructor(
    private readonly customerAuthService: CustomerAuthService,
    private readonly config: ConfigService,
  ) {}

  @Post('login')
  @Public()
  @HttpCode(HttpStatus.OK)
  // Rate-limited: this endpoint takes a username and password from the open
  // internet, so it is the one worth throttling hardest.
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Customer portal login',
    description:
      'Authenticates with the customer username and password set on the customer record. ' +
      'Requires status=ACTIVE and allowPortalAccess=true. A wrong username and a wrong password ' +
      'are reported identically so the endpoint cannot be used to enumerate accounts.',
  })
  @ApiResponse({
    status: 200,
    description: 'Signed in.',
    schema: {
      example: {
        customer: CUSTOMER_EXAMPLE,
        redirectTo: '/customer/streams',
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        csrfToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials, inactive, or portal disabled.' })
  async login(
    @Body() dto: CustomerLoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.customerAuthService.login(
      dto,
      (req as Request & { deviceType?: string }).deviceType ?? 'website',
    );
    this.setCookies(res, result.refreshToken, result.csrfToken);
    const { refreshToken: _refreshToken, ...body } = result;
    return body;
  }

  @Post('refresh')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Exchange the refresh cookie for a new access token',
    description:
      'The presented refresh token is revoked as part of the exchange, so a stolen one cannot ' +
      'be replayed after the customer has used it.',
  })
  @ApiResponse({ status: 200, description: 'New tokens issued.' })
  @ApiResponse({ status: 401, description: 'Missing, revoked, or expired refresh token.' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      CUSTOMER_REFRESH_COOKIE
    ];
    const result = await this.customerAuthService.refresh(
      token ?? '',
      (req as Request & { deviceType?: string }).deviceType ?? 'website',
    );
    this.setCookies(res, result.refreshToken, result.csrfToken);
    const { refreshToken: _refreshToken, ...body } = result;
    return body;
  }

  @Post('logout')
  @Public()
  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out',
    description:
      'Revokes the presented session, or every session for the account when no refresh cookie ' +
      'is sent.',
  })
  @ApiResponse({ status: 200, description: 'Signed out.', schema: { example: { success: true } } })
  async logout(
    @CurrentCustomer() customer: CustomerAuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = (req.cookies as Record<string, string> | undefined)?.[
      CUSTOMER_REFRESH_COOKIE
    ];
    const result = await this.customerAuthService.logout(customer.id, token);
    res.clearCookie(CUSTOMER_REFRESH_COOKIE, { path: '/api/v1/customer' });
    res.clearCookie(CUSTOMER_CSRF_COOKIE, { path: '/' });
    return result;
  }

  @Get('me')
  @Public()
  @UseGuards(CustomerJwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'The signed-in customer',
    description: '`impersonated` is true when a tenant admin is signed in as this customer.',
  })
  @ApiResponse({
    status: 200,
    description: 'Current customer.',
    schema: { example: { ...CUSTOMER_EXAMPLE, impersonated: false } },
  })
  async me(@CurrentCustomer() customer: CustomerAuthUser) {
    const profile = await this.customerAuthService.me(customer.id);
    return { ...profile, impersonated: customer.impersonated };
  }

  /**
   * The refresh cookie is scoped to the customer API path so it is never sent
   * to the tenant or system endpoints; the CSRF cookie is readable by the
   * client because it has to be echoed back in a header.
   */
  private setCookies(res: Response, refreshToken: string, csrfToken: string) {
    const secure = this.config.get<string>('COOKIE_SECURE') === 'true';
    res.cookie(CUSTOMER_REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/v1/customer',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    res.cookie(CUSTOMER_CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
