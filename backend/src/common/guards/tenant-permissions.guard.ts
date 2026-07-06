import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { TENANT_PERMISSIONS_KEY } from '../decorators/require-tenant-permissions.decorator';
import { TenantAuthUser } from '../decorators/current-tenant-user.decorator';

/**
 * RBAC guard for tenant-auth routes: checks the permission keys attached
 * with @RequireTenantPermissions() against the permissions resolved for the
 * tenant user's role (loaded by TenantJwtStrategy). Applied explicitly via
 * @UseGuards(TenantJwtAuthGuard, TenantPermissionsGuard) — never global.
 */
@Injectable()
export class TenantPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(
      TENANT_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: TenantAuthUser | undefined = request.user;
    if (!user) return false;

    const granted = new Set(user.permissions ?? []);
    const missing = required.filter((key) => !granted.has(key));
    if (missing.length > 0) {
      throw new ForbiddenException(
        `Missing required permission(s): ${missing.join(', ')}`,
      );
    }
    return true;
  }
}
