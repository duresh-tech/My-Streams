import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

export const TENANT_CSRF_COOKIE = 'tenant_csrf_token';
export const TENANT_CSRF_HEADER = 'x-csrf-token';

/**
 * Double-submit-cookie CSRF protection for tenant cookie-based endpoints
 * (refresh / logout, which rely on the httpOnly tenant_refresh_token cookie).
 * Uses a distinct cookie name from the system CsrfGuard so a tenant session
 * and a system session don't clobber each other's CSRF cookie in the same
 * browser (both would otherwise sit at path: '/').
 */
@Injectable()
export class TenantCsrfGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const cookieToken = request.cookies?.[TENANT_CSRF_COOKIE];
    const headerToken = request.headers[TENANT_CSRF_HEADER];
    if (!cookieToken || !headerToken || cookieToken !== headerToken) {
      throw new ForbiddenException('CSRF token mismatch');
    }
    return true;
  }
}
