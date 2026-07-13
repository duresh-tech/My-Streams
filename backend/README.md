# Backend — System API

[![Version](https://img.shields.io/badge/version-1.6.0-blue)](./CHANGELOG.md)

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

All routes are versioned under `/api/v{API_VERSION}` (defaults to `/api/v1`
via the `API_VERSION` env var — see below). Every request must send an
`x-device-type` header (`website | androidApp | iosApp | desktopApp`).

System-admin routes live under `/api/v1/system/...`. Every business-scoped
resource also has a **tenant self-service** twin under `/api/v1/tenant/...`,
authenticated with a separate tenant JWT and scoped to the caller's own
mapped business — same permission keys, same shared service, two
controllers (see `CHANGELOG.md` for the full per-resource list).

| Area | Routes |
| --- | --- |
| System auth | `POST /system/login`, `/system/register`, `/system/refresh`, `/system/logout`, `GET /system/me` |
| Tenant auth | `POST /tenant/login`, `/tenant/refresh`, `/tenant/logout`, `GET /tenant/me`, `GET /tenant/dashboard` |
| Permissions | `GET/POST /system/permissions`, `GET/PATCH/DELETE /system/permissions/:id` |
| Roles | `GET/POST /system/roles`, `GET/PATCH/DELETE /system/roles/:id` |
| System users | `GET/POST /system/users`, `GET/PATCH/DELETE /system/users/:id` |
| Tenant users | `GET/POST /system/tenant-users`, `GET/PATCH/DELETE /system/tenant-users/:id`, `POST /system/tenant-users/:id/login-as`; tenant self-service twin at `/tenant/users` (+ `GET /tenant/users/roles`) |
| Tenant business | `GET/POST /system/tenant-business`, `GET/PATCH/DELETE /system/tenant-business/:id`, `PATCH .../restore`; tenant self-service twin at `/tenant/business` (own profile only) |
| Tenant mapped business | `GET/POST /system/tenant-mapped-business`, `GET/PUT/PATCH/DELETE /system/tenant-mapped-business/:id`, `PATCH .../restore` |
| Tenant account | `GET/PATCH /tenant/account`, `POST /tenant/account/avatar` |
| Tenant tax types, payment modes, income & expense categories, business branches, network providers, mail config, places, streets | Each: `GET/POST /system/tenant-<resource>`, `GET/PATCH/DELETE /system/tenant-<resource>/:id` (+ `restore` where applicable); tenant self-service twin at `/tenant/<resource>` scoped to the caller's mapped business. Mail config additionally has `POST .../:id/test-email`, and tenant self-service create is capped at one config per account (system-admin create is not). |
| Tenant customers | `GET/POST /system/tenant-customers`, `GET/PATCH/DELETE /system/tenant-customers/:id`, `PATCH .../restore`, `PATCH .../:id/status`, `GET .../deleted`, `GET .../export` (CSV), `POST .../import` (CSV); tenant self-service twin at `/tenant/customers`, scoped to the caller's mapped business |
| Tenant QR devices | `GET/POST /system/tenant-qr-devices`, `GET/PATCH/DELETE /system/tenant-qr-devices/:id`, `PATCH .../restore`, `PATCH .../:id/payment-config`, `POST .../:id/push`, `POST .../:id/test`, `POST .../:id/log-serial`, plus `GET .../places`, `.../counters`, `.../events`; tenant self-service twin at `/tenant/qr-devices` (+ `GET .../businesses`), capped at one device per tenant account |
| App settings | `GET /system/app-settings/public/branding` (public), `GET/POST /system/app-settings`, `GET/PATCH/DELETE /system/app-settings/:id`, `PATCH .../restore`, `GET .../key/:key`, `POST .../logo` |
| Dashboard | `GET /system/dashboard` |
| Uploads | `POST /system/uploads`; tenant self-service twin at `POST /tenant/uploads` |

Full request/response schemas — including a concrete JSON example for
every success response — are at `http://localhost:4000/docs`.

## RBAC

Every protected system-admin route declares its required permission key
with `@RequirePermissions('module:action')` (e.g. `roles:delete`); tenant
self-service routes use the parallel `@RequireTenantPermissions()` /
`TenantPermissionsGuard`, evaluated independently of the system guard so
the two audiences never cross-check each other's routes. A global guard
resolves the caller's role → permissions on each request. `isSystem` roles
and permissions cannot be deleted, and a role's `roleKey` (or a system
permission's `permissionKey`/`moduleName`) is immutable once created.

Seeded permission keys (module: actions):

| Module | Actions |
| --- | --- |
| `dashboard` | `view` |
| `tenant-dashboard` | `view` |
| `tenant-account` | `view`, `update` |
| `permissions` | `create`, `read`, `update`, `delete` |
| `roles` | `create`, `read`, `update`, `delete` |
| `system-users` | `create`, `read`, `update`, `delete` |
| `tenant-users` | `create`, `read`, `view`, `update`, `delete`, `login-as` |
| `tenant-business` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-mapped-business` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-tax-types` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-payment-modes` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-in-ex-categories` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-places` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-streets` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-business-branches` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-network-providers` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `tenant-mail-config` | `create`, `view`, `update`, `delete`, `list`, `test` |
| `tenant-customers` | `create`, `view`, `update`, `delete`, `view_deleted`, `restore`, `export`, `import`, `change_status` |
| `tenant-qr-devices` | `create`, `view`, `update`, `delete`, `list`, `restore`, `push`, `test`, `manage_payment_config`, `view_events` |
| `app-settings` | `create`, `view`, `update`, `delete`, `list`, `restore` |
| `uploads` | `create` |

`TENANT_ADMIN` (the default `visibleToTenants` role) is granted the
non-`restore` actions of every tenant-scoped module, plus `tenant-users:*`
minus `login-as`. `tenant-customers` is the one exception — `TENANT_ADMIN`
gets all 9 actions including `restore`/`view_deleted`/`export`/`import`/
`change_status`. `tenant-qr-devices` also withholds `view_events` (in
addition to `restore`) from `TENANT_ADMIN` — the cross-device event log is
system-admin-only. `app-settings` is system-admin-only and not granted to
`TENANT_ADMIN` at all.

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

See [`.env.example`](./.env.example) for the full list: `API_VERSION`
(URI versioning, defaults to `1`), database connection, JWT
secrets/expiry, cookie settings, CORS origins, throttling, storage
driver/S3 credentials, and Swagger toggles.
