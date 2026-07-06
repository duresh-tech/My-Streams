# Backend — System API

[![Version](https://img.shields.io/badge/version-1.1.0-blue)](./CHANGELOG.md)

NestJS + Prisma REST API for the system console. See [`CHANGELOG.md`](./CHANGELOG.md)
for release history and [`../README.md`](../README.md) for the project overview.

| | |
| --- | --- |
| Framework | NestJS 10 (TypeScript) |
| ORM | Prisma 6 |
| Database | MySQL (driver-based; PostgreSQL-ready) |
| Auth | Passport.js — JWT access + rotating refresh token |
| Validation | Zod (`nestjs-zod`) |
| Docs | Swagger/OpenAPI at `/docs` |

## Setup

```bash
npm install
npx prisma db push     # creates the database + tables from prisma/schema.prisma
npm run seed            # system permissions, SUPER_ADMIN/SYSTEM_USER roles, admin user
npm run dev              # http://localhost:4000  (alias of start:dev)
```

Copy `.env.example` to `.env` and adjust for your environment before running the above.

Default seeded super admin: **admin / Admin@12345** (change or remove in production).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` / `start:dev` | Watch-mode dev server |
| `npm run build` | Compile to `dist/` |
| `npm run start:prod` | Run the compiled build |
| `npm run prisma:push` | Push the Prisma schema to the database (no migration history) |
| `npm run prisma:migrate` | Create/apply a versioned migration |
| `npm run prisma:studio` | Prisma Studio GUI |
| `npm run seed` | Seed permissions, roles, and the default admin |

## API surface

All routes are versioned under `/api/v1`. System-user-facing routes live under
`/api/v1/system/...`. Every request must send an `x-device-type` header
(`website | androidApp | iosApp | desktopApp`).

| Area | Routes |
| --- | --- |
| Auth | `POST /system/login`, `/system/register`, `/system/refresh`, `/system/logout`, `GET /system/me` |
| Permissions | `GET/POST /system/permissions`, `GET/PATCH/DELETE /system/permissions/:id` |
| Roles | `GET/POST /system/roles`, `GET/PATCH/DELETE /system/roles/:id` |
| System users | `GET/POST /system/users`, `GET/PATCH/DELETE /system/users/:id` |
| Dashboard | `GET /system/dashboard` |
| Uploads | `POST /system/uploads` |

Full request/response schemas: `http://localhost:4000/docs`.

## RBAC

Every protected route declares its required permission key with
`@RequirePermissions('module:action')` (e.g. `roles:delete`). A global guard
resolves the caller's role → permissions on each request. `isSystem` roles
and permissions cannot be deleted, and a role's `roleKey` (or a system
permission's `permissionKey`/`moduleName`) is immutable once created.

Seeded permission keys: `dashboard:view`, `permissions:{create,read,update,delete}`,
`roles:{create,read,update,delete}`, `system-users:{create,read,update,delete}`,
`uploads:create`.

## Security

- Argon2id password hashing.
- Helmet security headers; `x-powered-by` disabled.
- CORS restricted to `CORS_ORIGINS`.
- Rate limiting: global (`THROTTLE_LIMIT`/`THROTTLE_TTL_MS`) + a stricter
  5/min throttle on login and register.
- CSRF double-submit protection (`csrf_token` cookie + `x-csrf-token`
  header) on the cookie-based refresh/logout endpoints.
- Prisma parameterized queries (no raw SQL) prevent injection.
- Zod validation on every request body via a global pipe.

## Storage

`STORAGE_DRIVER=local|s3` in `.env`. Local files are written under
`LOCAL_STORAGE_DIR` and served at `/uploads`; S3 uses `@aws-sdk/client-s3`.
Only the relative **path** is ever stored in the database — never a full URL.

## Database & the MySQL → PostgreSQL migration path

IDs are UUIDv7 (`CHAR(36)`), timestamps are UNIX seconds (`BIGINT`), and
enums are native — no MySQL-specific types are used, so moving to
PostgreSQL once the customer base grows (~1000+) is:

1. In `prisma/schema.prisma`, change `provider = "mysql"` → `"postgresql"`.
2. Update `DATABASE_URL` and `DATABASE_PROVIDER` in `.env`.
3. Run `npx prisma migrate dev` (plus a data copy via pgloader or an ETL job).

No application code changes are required.

## Environment variables

See [`.env.example`](./.env.example) for the full list: database connection,
JWT secrets/expiry, cookie settings, CORS origins, throttling, storage
driver/S3 credentials, and Swagger toggles.
