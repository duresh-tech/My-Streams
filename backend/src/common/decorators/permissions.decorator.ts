import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'requiredPermissions';

/**
 * Declares the permission keys required to access a route (RBAC).
 * Ex. @RequirePermissions('roles:delete')
 */
export const RequirePermissions = (...permissionKeys: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissionKeys);
