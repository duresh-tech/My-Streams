import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { LoginDto, RegisterDto } from './dto/auth.dto';
import { Public } from '../common/decorators/public.decorator';
import {
  AuthUser,
  CurrentUser,
} from '../common/decorators/current-user.decorator';
import { CsrfGuard, CSRF_COOKIE } from '../common/guards/csrf.guard';

const REFRESH_COOKIE = 'refresh_token';

const SANITIZED_USER_EXAMPLE = {
  id: '019f354f-2515-76e3-abc2-1ea12b1aba6e',
  systemCode: 'USR-MR8M8F60-74F8',
  fName: 'System Administrator',
  username: 'admin',
  email: 'admin@system.local',
  roleId: '019f354f-24c8-776a-b92a-b8cb7ac2d576',
  status: 'ACTIVE',
  createdAt: 1783305807,
  updatedAt: 1783305807,
  deletedAt: null,
  role: {
    id: '019f354f-24c8-776a-b92a-b8cb7ac2d576',
    roleKey: 'SUPER_ADMIN',
    displayName: 'Super Administrator',
  },
};

const LOGIN_RESPONSE_EXAMPLE = {
  user: SANITIZED_USER_EXAMPLE,
  permissions: ['dashboard:view', 'roles:read', 'roles:create', 'roles:update', 'roles:delete'],
  redirectTo: '/system/dashboard',
  accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlm...',
  csrfToken: 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0',
};

const AUTH_ME_EXAMPLE = {
  id: '019f354f-2515-76e3-abc2-1ea12b1aba6e',
  username: 'admin',
  email: 'admin@system.local',
  roleId: '019f354f-24c8-776a-b92a-b8cb7ac2d576',
  roleKey: 'SUPER_ADMIN',
  permissions: ['dashboard:view', 'roles:read', 'roles:create', 'roles:update', 'roles:delete'],
};

@ApiTags('System / Auth')
@Controller('system')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'System user login',
    description:
      'Authenticates a system user with username (or email) + password. ' +
      'Returns a JWT access token in the body; the refresh token and CSRF ' +
      'token are set as cookies. On success the client should redirect to ' +
      '`/system/dashboard`.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged in; access token issued.',
    schema: { example: LOGIN_RESPONSE_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  @ApiResponse({ status: 429, description: 'Too many login attempts.' })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, (req as any).deviceType);
    this.setAuthCookies(res, result.refreshToken, result.csrfToken);
    const { refreshToken, ...body } = result;
    return body;
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('register')
  @ApiOperation({
    summary: 'Register a system user',
    description:
      'Creates a system user account. The very first account is assigned the ' +
      'SUPER_ADMIN role; subsequent accounts get SYSTEM_USER.',
  })
  @ApiResponse({
    status: 201,
    description: 'User created.',
    schema: {
      example: { ...SANITIZED_USER_EXAMPLE, username: 'jane.doe', email: 'jane@example.com' },
    },
  })
  @ApiResponse({ status: 409, description: 'Username or email already in use.' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @UseGuards(CsrfGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate tokens',
    description:
      'Exchanges the httpOnly refresh_token cookie for a new access/refresh ' +
      'pair (rotation). Requires the x-csrf-token header matching the ' +
      'csrf_token cookie.',
  })
  @ApiResponse({
    status: 200,
    description: 'New token pair issued.',
    schema: {
      example: { accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIwMTlm...' },
    },
  })
  @ApiResponse({ status: 401, description: 'Refresh token invalid/revoked.' })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.[REFRESH_COOKIE];
    if (!token) throw new UnauthorizedException('No refresh token cookie');
    const tokens = await this.authService.refresh(
      token,
      (req as any).deviceType,
    );
    this.setAuthCookies(res, tokens.refreshToken, tokens.csrfToken);
    return { accessToken: tokens.accessToken };
  }

  @ApiBearerAuth()
  @UseGuards(CsrfGuard)
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Logout',
    description:
      'Revokes the current refresh token (or all of the user\'s tokens when ' +
      'no cookie is present) and clears auth cookies.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out.',
    schema: { example: { success: true } },
  })
  async logout(
    @CurrentUser() user: AuthUser,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.logout(user.id, req.cookies?.[REFRESH_COOKIE]);
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/system' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
    return { success: true };
  }

  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({
    summary: 'Current user',
    description:
      'Returns the authenticated system user with role and resolved permissions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Authenticated user profile.',
    schema: { example: AUTH_ME_EXAMPLE },
  })
  @ApiResponse({ status: 401, description: 'Missing/invalid access token.' })
  me(@CurrentUser() user: AuthUser) {
    return user;
  }

  private setAuthCookies(res: Response, refreshToken: string, csrfToken: string) {
    const secure = this.config.get('COOKIE_SECURE') === 'true';
    // httpOnly refresh token, scoped to the system API only
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure,
      sameSite: 'strict',
      path: '/api/v1/system',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    // readable CSRF token for the double-submit pattern
    res.cookie(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
  }
}
