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

@ApiTags('System / Auth')
@Controller({ path: 'system', version: '1' })
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
  @ApiResponse({ status: 200, description: 'Logged in; access token issued.' })
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
  @ApiResponse({ status: 201, description: 'User created.' })
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
  @ApiResponse({ status: 200, description: 'New token pair issued.' })
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
  @ApiResponse({ status: 200, description: 'Logged out.' })
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
  @ApiResponse({ status: 200, description: 'Authenticated user profile.' })
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
