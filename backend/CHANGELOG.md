# Changelog

All notable changes to the backend are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: ../../compare/backend-v1.1.0...HEAD
[1.1.0]: ../../compare/backend-v1.0.0...backend-v1.1.0
[1.0.0]: ../../releases/tag/backend-v1.0.0
