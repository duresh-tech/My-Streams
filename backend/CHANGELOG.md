# Changelog

All notable changes to the backend are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: ../../compare/backend-v1.3.0...HEAD
[1.3.0]: ../../compare/backend-v1.2.0...backend-v1.3.0
[1.2.0]: ../../compare/backend-v1.1.0...backend-v1.2.0
[1.1.0]: ../../compare/backend-v1.0.0...backend-v1.1.0
[1.0.0]: ../../releases/tag/backend-v1.0.0
