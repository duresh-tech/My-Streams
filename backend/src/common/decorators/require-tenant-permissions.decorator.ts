import { SetMetadata } from '@nestjs/common';

export const TENANT_PERMISSIONS_KEY = 'requiredTenantPermissions';

/**
 * Declares the permission keys required to access a tenant-auth route (RBAC).
 * Uses a distinct metadata key from @RequirePermissions() so the global
 * (system) PermissionsGuard never evaluates it — see TenantPermissionsGuard.
 * Ex. @RequireTenantPermissions('tenant-dashboard:view')
 */
export const RequireTenantPermissions = (...permissionKeys: string[]) =>
  SetMetadata(TENANT_PERMISSIONS_KEY, permissionKeys);
