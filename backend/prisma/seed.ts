/**
 * Seeds system permissions, system roles (SUPER_ADMIN, SYSTEM_USER) and a
 * default super-admin account. Idempotent: safe to re-run.
 *
 *   npm run seed
 *
 * Default super admin: admin / admin@system.local / Admin@12345
 */
import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { v7 as uuidv7 } from 'uuid';

const prisma = new PrismaClient();

const now = () => Math.floor(Date.now() / 1000);
const newSystemCode = (prefix: string) =>
  `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

interface PermissionSeed {
  moduleName: string;
  action: string;
  displayName: string;
  description: string;
}

const MODULES: Array<{ module: string; label: string; actions: string[] }> = [
  { module: 'dashboard', label: 'Dashboard', actions: ['view'] },
  { module: 'tenant-dashboard', label: 'Tenant Dashboard', actions: ['view'] },
  { module: 'tenant-account', label: 'Tenant Account', actions: ['view', 'update'] },
  { module: 'permissions', label: 'Permissions', actions: ['create', 'read', 'update', 'delete'] },
  { module: 'roles', label: 'Roles', actions: ['create', 'read', 'update', 'delete'] },
  { module: 'system-users', label: 'System Users', actions: ['create', 'read', 'update', 'delete'] },
  { module: 'tenant-users', label: 'Tenant Users', actions: ['create', 'read', 'view', 'update', 'delete', 'login-as'] },
  { module: 'tenant-business', label: 'Tenant Business', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-mapped-business', label: 'Tenant Mapped Business', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-tax-types', label: 'Tenant Tax Types', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-payment-modes', label: 'Tenant Payment Modes', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-in-ex-categories', label: 'Tenant Income & Expense Categories', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-places', label: 'Tenant Places', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-streets', label: 'Tenant Streets', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-counters', label: 'Tenant Counters', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-qr-devices', label: 'Tenant QR Devices', actions: ['create', 'view', 'update', 'delete', 'list', 'restore', 'push', 'test', 'manage_payment_config', 'view_events'] },
  { module: 'tenant-customers', label: 'Tenant Customers', actions: ['create', 'view', 'update', 'delete', 'view_deleted', 'restore', 'export', 'import', 'change_status'] },
  { module: 'tenant-business-branches', label: 'Tenant Business Branches', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-network-providers', label: 'Tenant Network Providers', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'tenant-mail-config', label: 'Tenant Mail Config', actions: ['create', 'view', 'update', 'delete', 'list', 'test'] },
  { module: 'app-settings', label: 'App Settings', actions: ['create', 'view', 'update', 'delete', 'list', 'restore'] },
  { module: 'uploads', label: 'Uploads', actions: ['create'] },
];

const PERMISSIONS: PermissionSeed[] = MODULES.flatMap(({ module, label, actions }) =>
  actions.map((action) => ({
    moduleName: module,
    action,
    displayName: `${action.charAt(0).toUpperCase()}${action.slice(1)} ${label}`,
    description: `${action} access for ${module}`.slice(0, 50),
  })),
);

/**
 * One-time cleanup: tenant-expense-categories was renamed to
 * tenant-in-ex-categories. Deletes the old permission rows (RolePermission
 * grants cascade) so stale keys don't linger in the Roles UI. No-op once run.
 */
async function cleanupLegacyPermissions() {
  const removedModules = ['tenant-expense-categories', 'qr-display-templates', 'tenant-sms'];
  for (const moduleName of removedModules) {
    const stale = await prisma.permission.findMany({ where: { moduleName }, select: { id: true } });
    if (stale.length === 0) continue;
    // Delete role_permissions explicitly rather than relying on the DB-level
    // cascade - `prisma db push` doesn't reliably (re)apply ON DELETE CASCADE
    // to an existing foreign key, so orphaned rows can otherwise survive and
    // break any query that joins role -> role_permissions -> permission.
    await prisma.rolePermission.deleteMany({ where: { permissionId: { in: stale.map((p) => p.id) } } });
    const { count } = await prisma.permission.deleteMany({ where: { moduleName } });
    console.log(`  - removed ${count} legacy ${moduleName} permission(s)`);
  }
}

async function seedPermissions(): Promise<Map<string, string>> {
  const keyToId = new Map<string, string>();
  for (const p of PERMISSIONS) {
    const permissionKey = `${p.moduleName}:${p.action}`;
    const existing = await prisma.permission.findUnique({ where: { permissionKey } });
    if (existing) {
      keyToId.set(permissionKey, existing.id);
      continue;
    }
    const timestamp = now();
    const created = await prisma.permission.create({
      data: {
        id: uuidv7(),
        systemCode: newSystemCode('PRM'),
        displayName: p.displayName,
        moduleName: p.moduleName,
        permissionKey,
        description: p.description,
        isSystem: true,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    keyToId.set(permissionKey, created.id);
    console.log(`  + permission ${permissionKey}`);
  }
  return keyToId;
}

async function seedRole(
  roleKey: string,
  displayName: string,
  permissionIds: string[],
  visibleToTenants = false,
): Promise<string> {
  let role = await prisma.role.findUnique({ where: { roleKey } });
  const timestamp = now();
  if (!role) {
    role = await prisma.role.create({
      data: {
        id: uuidv7(),
        systemCode: newSystemCode('ROL'),
        roleKey,
        displayName,
        isSystem: true,
        visibleToTenants,
        status: 'ACTIVE',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
    });
    console.log(`  + role ${roleKey}`);
  }
  for (const permissionId of permissionIds) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId } },
      update: {},
      create: { roleId: role.id, permissionId, createdAt: timestamp },
    });
  }
  return role.id;
}

async function seedSuperAdmin(roleId: string) {
  const username = 'admin';
  const existing = await prisma.systemUser.findUnique({ where: { username } });
  if (existing) return;
  const timestamp = now();
  await prisma.systemUser.create({
    data: {
      id: uuidv7(),
      systemCode: newSystemCode('USR'),
      fName: 'System Administrator',
      username,
      email: 'admin@system.local',
      passwordHash: await argon2.hash('Admin@12345', { type: argon2.argon2id }),
      roleId,
      status: 'ACTIVE',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  console.log('  + user admin (password: Admin@12345)');
}

// Carried forward from the old AppSettings singleton (appName/logoPath) when
// the table was redesigned into a generic typed key-value store. Idempotent -
// upsert leaves an existing row untouched on subsequent seed runs.
async function seedAppSettings() {
  const timestamp = now();
  await prisma.appSetting.upsert({
    where: { key: 'app.name' },
    update: {},
    create: {
      id: uuidv7(),
      key: 'app.name',
      dataType: 'STRING',
      value: 'SaaS - Web Solutions',
      description: 'Name of the application',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  console.log('  + app setting app.name');

  await prisma.appSetting.upsert({
    where: { key: 'app.logo_path' },
    update: {},
    create: {
      id: uuidv7(),
      key: 'app.logo_path',
      dataType: 'STRING',
      value: 'app-settings/019f3d95-8bce-704a-aa81-4e4c2149e733.png',
      description: 'Path to the application logo',
      createdAt: timestamp,
      updatedAt: timestamp,
    },
  });
  console.log('  + app setting app.logo_path');
}

async function main() {
  console.log('Cleaning up legacy permissions...');
  await cleanupLegacyPermissions();

  console.log('Seeding permissions...');
  const keyToId = await seedPermissions();
  const allIds = [...keyToId.values()];

  console.log('Seeding roles...');
  const superAdminRoleId = await seedRole('SUPER_ADMIN', 'Super Administrator', allIds);
  await seedRole(
    'SYSTEM_USER',
    'System User',
    ['dashboard:view'].map((k) => keyToId.get(k)!).filter(Boolean),
  );
  await seedRole(
    'TENANT_ADMIN',
    'Tenant Administrator',
    [
      'tenant-dashboard:view',
      'tenant-account:view',
      'tenant-account:update',
      'tenant-business:view',
      'tenant-business:update',
      'tenant-users:create',
      'tenant-users:read',
      'tenant-users:view',
      'tenant-users:update',
      'tenant-users:delete',
      'tenant-tax-types:list',
      'tenant-tax-types:view',
      'tenant-tax-types:create',
      'tenant-tax-types:update',
      'tenant-tax-types:delete',
      'tenant-payment-modes:list',
      'tenant-payment-modes:view',
      'tenant-payment-modes:create',
      'tenant-payment-modes:update',
      'tenant-payment-modes:delete',
      'tenant-in-ex-categories:list',
      'tenant-in-ex-categories:view',
      'tenant-in-ex-categories:create',
      'tenant-in-ex-categories:update',
      'tenant-in-ex-categories:delete',
      'tenant-business-branches:list',
      'tenant-business-branches:view',
      'tenant-business-branches:create',
      'tenant-business-branches:update',
      'tenant-business-branches:delete',
      'tenant-network-providers:list',
      'tenant-network-providers:view',
      'tenant-network-providers:create',
      'tenant-network-providers:update',
      'tenant-network-providers:delete',
      'tenant-mail-config:list',
      'tenant-mail-config:view',
      'tenant-mail-config:create',
      'tenant-mail-config:update',
      'tenant-mail-config:delete',
      'tenant-mail-config:test',
      'tenant-places:list',
      'tenant-places:view',
      'tenant-places:create',
      'tenant-places:update',
      'tenant-places:delete',
      'tenant-streets:list',
      'tenant-streets:view',
      'tenant-streets:create',
      'tenant-streets:update',
      'tenant-streets:delete',
      'tenant-counters:list',
      'tenant-counters:view',
      'tenant-counters:create',
      'tenant-counters:update',
      'tenant-counters:delete',
      'tenant-qr-devices:list',
      'tenant-qr-devices:view',
      'tenant-qr-devices:create',
      'tenant-qr-devices:update',
      'tenant-qr-devices:delete',
      'tenant-qr-devices:push',
      'tenant-qr-devices:test',
      'tenant-qr-devices:manage_payment_config',
      'tenant-customers:create',
      'tenant-customers:view',
      'tenant-customers:update',
      'tenant-customers:delete',
      'tenant-customers:view_deleted',
      'tenant-customers:restore',
      'tenant-customers:export',
      'tenant-customers:import',
      'tenant-customers:change_status',
    ]
      .map((k) => keyToId.get(k)!)
      .filter(Boolean),
    true,
  );

  console.log('Seeding super admin user...');
  await seedSuperAdmin(superAdminRoleId);

  console.log('Seeding app settings (carried forward from the old branding singleton)...');
  await seedAppSettings();

  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
