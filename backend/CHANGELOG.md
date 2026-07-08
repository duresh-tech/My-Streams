# Changelog

All notable changes to the backend are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.5.0] - 2026-07-09

### Added

- **Tenant Customers** (`tenant_customers`): the largest dual-surface
  resource yet — customer records scoped to a tenant business, with a
  cascading Place → Street picker (`tenantPlaceId` optional,
  `tenantStreetId` optional but must belong to the chosen place), KYC/tax
  fields, four notification/access flags, and a map-pickable
  latitude/longitude. Nine permissions (not the usual six): `create`,
  `view`, `update`, `delete`, `view_deleted`, `restore`, `export`,
  `import`, `change_status`.
  - `GET /system/tenant-customers/deleted` (and the tenant-scoped twin)
    is the only way to see soft-deleted rows — the normal `GET` list
    always excludes `DELETED` regardless of any `status` query param,
    gated by the new `view_deleted` permission instead of `view`.
  - `PATCH .../:id/status` changes status to `ACTIVE`/`INACTIVE`/`BLOCKED`
    only, kept separate from the full `PATCH` update and from
    delete/restore.
  - `GET .../export` streams a CSV of the current filtered list;
    `POST .../import` accepts a CSV upload and validates each row
    independently — a bad row is skipped and reported by row number
    rather than aborting the whole batch.
- **Tenant Uploads** (`POST /tenant/uploads`): a generic tenant-scoped
  file upload endpoint (mirrors the system `/system/uploads`), gated only
  by a valid tenant JWT (no extra permission) so any authenticated tenant
  user can upload a customer photo or ID-proof file and get back a
  storage path.
- **App Settings redesign** (`app_settings`): replaced the fixed-shape
  `AppSettings` branding singleton with a generic typed key-value store —
  `key` (unique), `dataType` (`STRING`/`TEXT`/`INTEGER`/`DECIMAL`/
  `BOOLEAN`/`JSON`/`DATE`/`DATETIME`/`TIME`), `value` (validated against
  `dataType` on write), `description`, soft-delete `status`. `key` and
  `dataType` are immutable after creation.
  - `GET /system/app-settings/public/branding` replaces the old
    `GET /system/settings` — same public, unauthenticated
    `{ appName, logoPath }` response shape, now backed by the `app.name`
    and `app.logo_path` keys internally so nothing downstream had to
    change.
  - Full CRUD + restore under `/system/app-settings`, plus
    `GET .../key/:key` (look up a setting by its key) and
    `POST .../logo` (upload/replace the app logo, upserting the
    `app.logo_path` row).
  - The existing branding row's values were carried forward as the first
    two seeded rows rather than lost in the schema change.

### Changed

- Permission module `system-settings` (`view`/`update`) replaced by
  `app-settings` (`create`/`view`/`update`/`delete`/`list`/`restore`).

## [1.4.0] - 2026-07-08

A tenant-facing portal and a full set of business-scoped resources, all
following the same dual-surface pattern established here: one Prisma
model + one shared service, exposed through a system-admin controller
(unrestricted) and a tenant self-service controller (scoped to the
caller's own mapped business), sharing one permission-key namespace.

### Added

- **Tenant portal & auth**: a parallel tenant-facing auth audience, fully
  namespaced so a tenant session and a system-admin session coexist in the
  same browser — `TenantJwtStrategy` (`jwt-tenant`), its own
  `tenant_refresh_tokens` table, distinct cookie names
  (`tenant_refresh_token`/`tenant_csrf_token`), and a separate
  `@RequireTenantPermissions`/`TenantPermissionsGuard` pair (own metadata
  key, never evaluated by the system `PermissionsGuard`). `POST
  /tenant/login`, `/tenant/refresh`, `/tenant/logout`, `GET /tenant/me`,
  `GET /tenant/dashboard`. Seeded `tenant-dashboard:view` permission and a
  default `TENANT_ADMIN` role (`visibleToTenants`).
- **"Login as" impersonation**: `POST /system/tenant-users/:id/login-as`
  issues a tenant session for a given tenant user without their password
  (`tenant-users:login-as` permission), for system-admin support use.
- **Tenant Business** (`tenant_business`): full CRUD + restore, contact/
  address fields, optional logo, `isParentBusiness` flag, filtering by
  `status`/`country`/`isParentBusiness` and sorting. Tenant self-service
  surface added later for a caller to view/update their own business
  profile (`isParentBusiness`/`status` stay system-admin-only).
- **Tenant Mapped Business** (`tenant_mapped_business`): links a tenant
  user to a business (unique per tenant user — one business at a time),
  list/view/create/update/delete/restore.
- **Tenant Account** self-service (`tenant-account:view/update`): tenant
  users manage their own name/username/email/phone/password/avatar.
- **Tenant Tax Types** (`tenant_tax_types`): `taxName`, `calculationType`
  (PERCENTAGE/FIXED), `value`, `description`.
- **Tenant Payment Modes** (`tenant_payment_modes`): adds an `isSystem`
  flag (never client-settable) that protects system-seeded rows from
  tenant edit/delete on both controllers.
- **Tenant Income & Expense Categories** (`tenant_in_ex_categories`,
  originally shipped as `tenant_expense_categories`): adds a `type`
  (INCOME/EXPENSE) and a frontend-derived `inExCode`.
- **Tenant Business Branches** (`tenant_business_branches`): branch name,
  contact, address, description.
- **Tenant Network Providers** (`tenant_network_providers`): `type` ENUM
  (CABLE_TV/ISP/IPTV/OTHERS), name, contact, address (only name/type
  required).
- **Tenant Mail Config** (`tenant_mail_config`): SMTP settings
  (`mailHost`/`mailPort`/`mailUsername`/`mailPassword`/`mailEncryption`/
  `fromMailAddress`/`fromMailName`). `mailPassword` is write-only — reads
  return a `hasPassword` boolean instead. `POST .../:id/test-email`
  (`tenant-mail-config:test`) sends a real test email via nodemailer and
  surfaces SMTP errors. No restore endpoint (soft-delete only, per spec).
- **System Settings / SaaS customization**: an `AppSettings` singleton
  (`appName`, `logoPath`) with a public unauthenticated `GET` (so the
  branding can render anywhere) and a permission-gated `PATCH` +
  logo-upload for system admins (`system-settings:view/update`).
- **Tenant Places** (`tenant_places`): `placeName`, `remark`, and
  `latitude`/`longitude`/`radiusMeters` for geofencing.
- **Tenant Streets** (`tenant_streets`): scoped to a business and a place
  within it (server-validated so a street's place must belong to its
  business); a unique 3-letter `streetCode` per business.
- **Tenant Users self-service** (`/tenant/users`): tenant admins manage
  the users mapped to their own business, reusing the existing
  `tenant-users:{create,read,update,delete}` permission keys — creating a
  user auto-maps it to the caller's business, and callers can't delete
  their own account. New `tenant-users:view` permission gates a read-only
  detail view (additive; doesn't change any existing route's required
  permission).
- `backend/scripts/free-port.js`: frees port 4000 before `npm run dev` /
  `start:dev` (wired as `predev`/`prestart:dev`), so a leftover
  `node dist/src/main` instance no longer blocks the dev server with
  `EADDRINUSE`.

### Changed

- Tenant-scoped Payment Mode / Income & Expense Category listings now
  treat `isSystem: true` rows as global defaults, visible to every tenant
  user regardless of which business they're mapped to.
- `tenant_mapped_business` restricted to one active business per tenant
  user (unique constraint changed from a composite key to `tenantUserId`
  alone); create/update simplified to a single `tenantBusinessId`.

### Fixed

- Payment Modes: `isSystem` rows could still be **edited** even though
  delete was already blocked — update is now guarded too.
- A permission-rename cleanup (`tenant-expense-categories` →
  `tenant-in-ex-categories`) left orphaned `RolePermission` rows pointing
  at deleted permission ids, crashing tenant login's nested permission
  include; removed the orphaned rows directly.
- Mail config: SMTP port 465/2465 (implicit TLS, e.g. Resend) combined
  with `mailEncryption=NONE` dropped the connection before the handshake
  — these ports now force `secure: true` regardless of the stored
  encryption value.

## [1.3.0] - 2026-07-06

### Added

- Tenant Business CRUD module (`tenant_business` table): full REST CRUD
  (`GET/POST /system/tenant-business`, `GET/PATCH/DELETE
  /system/tenant-business/:id`) plus `PATCH
  /system/tenant-business/:id/restore` — the first soft-delete
  restore/undelete capability in the codebase.
- Six granular RBAC permissions seeded for the new module:
  `tenant-business:{create,view,update,delete,list,restore}` — the first
  resource to split `list`/`view` into separate permissions instead of a
  single `read`, and the first with a `restore` action.
- The list endpoint supports `status`, `country`, and `isParentBusiness`
  filters plus `sortBy`/`sortOrder` sorting (module-local
  `TenantBusinessListQueryDto`) — the first list endpoint in the codebase
  to go beyond the shared `page`/`limit`/`search` contract.

## [1.2.0] - 2026-07-06

### Added

- `API_VERSION` environment variable drives URI-based API versioning end
  to end. `main.ts` reads it into `app.enableVersioning({ defaultVersion })`
  instead of a hardcoded `'1'`, and every controller's `@Controller()`
  decorator now omits its own `version` so they all inherit the env-driven
  default — one place to bump when a `v2` is needed.
- Every Swagger `@ApiResponse` across all six controllers now includes a
  `schema: { example: {...} }` showing the actual JSON response shape
  (built from the real service/`select` fields, not guessed), so
  `/docs` renders a concrete example for logins, CRUD reads/writes,
  dashboard stats, and uploads instead of just a status code + description.

## [1.1.0] - 2026-07-06

### Fixed

- `roles.service.ts`: role deletion and the role list's user count included
  soft-deleted (`status: DELETED`) `system_users` rows in the `_count`
  aggregation. A role could stay permanently blocked from deletion even
  after its only assigned user was removed. The relation count is now
  scoped with `where: { status: { not: 'DELETED' } }` on both `findAll`
  and `remove`.

## [1.0.0] - 2026-07-06

### Added

- Initial NestJS + Prisma + MySQL backend scaffold.
- Database schema: `permissions`, `roles`, `role_permissions`,
  `system_users`, `refresh_tokens` — UUIDv7 primary keys, unique
  human-readable `systemCode`, UNIX-timestamp audit columns, soft deletes
  via `status`. Schema is engine-portable (MySQL now, PostgreSQL-ready).
- Authentication via Passport.js: `POST /system/login`, `/system/register`,
  `/system/refresh` (rotating refresh token), `/system/logout`,
  `GET /system/me`. JWT access tokens (15 min) + httpOnly refresh cookie
  (7 days, SHA-256 hash stored server-side).
- Role-based access control: `@RequirePermissions()` decorator + global
  `PermissionsGuard`, resolved per-request from the user's role.
- Full CRUD REST endpoints for permissions, roles, and system users,
  plus `/system/dashboard` stats and `/system/uploads`.
- Zod request validation via `nestjs-zod`, surfaced in Swagger.
- Security: Argon2id password hashing, helmet security headers, CORS
  allow-list, rate limiting (global + stricter login/register throttle),
  CSRF double-submit protection on cookie-based endpoints, mandatory
  `x-device-type` header, Prisma parameterized queries.
- Driver-based file storage: `STORAGE_DRIVER=local|s3`; only the file
  path is persisted, never a URL.
- Swagger/OpenAPI documentation at `/docs` for every endpoint.
- URI-based API versioning (`/api/v1/...`).
- Seed script for system permissions, `SUPER_ADMIN`/`SYSTEM_USER` roles,
  and a default super admin account.

[Unreleased]: ../../compare/backend-v1.5.0...HEAD
[1.5.0]: ../../compare/backend-v1.4.0...backend-v1.5.0
[1.4.0]: ../../compare/backend-v1.3.0...backend-v1.4.0
[1.3.0]: ../../compare/backend-v1.2.0...backend-v1.3.0
[1.2.0]: ../../compare/backend-v1.1.0...backend-v1.2.0
[1.1.0]: ../../compare/backend-v1.0.0...backend-v1.1.0
[1.0.0]: ../../releases/tag/backend-v1.0.0
