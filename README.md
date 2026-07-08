# Project 5 — System Console

[![Backend](https://img.shields.io/badge/backend-v1.5.0-blue)](./backend/CHANGELOG.md)
[![Frontend](https://img.shields.io/badge/frontend-v1.4.0-blue)](./frontend/CHANGELOG.md)

Full-stack system administration console with RBAC-driven CRUD for system
users, roles, and permissions, plus a parallel **tenant portal**: tenant
users log in separately and manage their own business — team members,
customers, branches, network providers, tax types, payment modes, income &
expense categories, mail config, places, and streets — mirroring the
system-admin CRUD for each resource, scoped to their own mapped business.
A generic typed key-value **App Settings** store backs app-wide config
(branding and beyond).

| Layer    | Stack                                                             |
| -------- | ----------------------------------------------------------------- |
| Frontend | Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui  |
| Backend  | NestJS 10 · TypeScript · Prisma ORM · Passport JWT · Zod          |
| Database | MySQL (driver-based via env; PostgreSQL-ready schema)             |
| Storage  | Driver-based: local public folder or cloud S3 (paths only in DB)  |

```
project_5/
├── backend/    NestJS REST API  → http://localhost:4000/api/v1  (Swagger: /docs)
│               README.md · CHANGELOG.md
└── frontend/   Next.js app      → http://localhost:3000
                README.md · CHANGELOG.md
```

Each app is versioned and documented independently — see
[`backend/README.md`](./backend/README.md) /
[`backend/CHANGELOG.md`](./backend/CHANGELOG.md) and
[`frontend/README.md`](./frontend/README.md) /
[`frontend/CHANGELOG.md`](./frontend/CHANGELOG.md) for details specific
to each. This file covers the project as a whole.

## Quick start

Prerequisites: Node 20+, MySQL running (WAMP), npm.

```bash
# Backend
cd backend
npm install
npx prisma db push        # creates project5_db and tables
npm run seed              # system permissions, roles, super admin
npm run dev               # http://localhost:4000

# Frontend (second terminal)
cd frontend
npm install
npm run dev               # http://localhost:3000
```

Default super admin (from seed): **admin** / **Admin@12345** (admin@system.local).
Login page: `http://localhost:3000/system/login` → redirects to `/system/dashboard`.

## Backend

- **API versioning**: URI-based, driven by the `API_VERSION` env var (defaults to `1` → `/api/v1`). System-user routes live under `/api/v1/system/...`.
- **Swagger / OpenAPI**: `http://localhost:4000/docs` — every endpoint documented (operations, params, responses with JSON examples, bearer auth, global `x-device-type` header). Keep decorators updated on every endpoint change.
- **Auth (Passport.js)**: JWT access token (Bearer, 15 min) + rotating refresh token (httpOnly cookie, 7 days, SHA-256 hash stored in `refresh_tokens`). `POST /system/login`, `/system/register`, `/system/refresh`, `/system/logout`, `GET /system/me`.
- **Tenant portal & auth**: a fully parallel, namespaced auth audience (own JWT strategy, refresh-token table, and cookie names) so a tenant session and a system-admin session coexist in the same browser. `POST /tenant/login`, `GET /tenant/me`, `GET /tenant/dashboard`. System admins can also "Login as" any tenant user.
- **RBAC**: `permissions` ⇄ `role_permissions` ⇄ `roles` ⇄ `system_users`/`tenant_users`. System routes declare `@RequirePermissions('roles:delete')`; tenant routes use the parallel `@RequireTenantPermissions()`, evaluated by an independent guard. Full CRUD is exposed for permissions, roles, system users, and every tenant-scoped business resource (business, mapped business, tax types, payment modes, income & expense categories, business branches, network providers, mail config, places, streets, customers, and now tenant users themselves via self-service).
- **App Settings**: a generic typed key-value config store (`app_settings` — `key`, `dataType`, `value`, `description`, soft-delete `status`) replaces the old fixed-shape branding singleton. A stable public `GET /system/app-settings/public/branding` endpoint keeps the app name/logo contract unchanged for every consumer.
- **Dual-surface CRUD pattern**: each tenant-scoped resource is one Prisma model + one shared service, exposed through a system-admin controller (unrestricted) and a tenant self-service controller (scoped to the caller's own mapped business via `tenant_mapped_business`), sharing one permission-key namespace.
- **Validation**: Zod schemas via `nestjs-zod` (global pipe), surfaced in Swagger.
- **Security**: Argon2id password hashing · helmet security headers · CORS restricted to `CORS_ORIGINS` · rate limiting (global 100/min, login 5/min) · CSRF double-submit (cookie `csrf_token` + header `x-csrf-token` on cookie-based endpoints) · SQL injection prevented by Prisma parameterized queries · mandatory `x-device-type` header (`website | androidApp | iosApp | desktopApp`).
- **Storage**: `STORAGE_DRIVER=local|s3`. Local files go to `public/uploads` (served at `/uploads`); S3 uses `@aws-sdk/client-s3`. Only the **path** is stored, never a URL. Upload endpoint: `POST /system/uploads`.
- **IDs & timestamps**: UUIDv7 primary keys, unique human-readable `systemCode` per record, UNIX-timestamp `createdAt/updatedAt/deletedAt` columns, soft deletes via `status=DELETED`.

### MySQL → PostgreSQL migration (at 1000+ customers)

The schema is engine-portable by design (CHAR(36) UUIDs, BIGINT unix timestamps, native enums, no vendor types):

1. In `backend/prisma/schema.prisma` change `provider = "mysql"` → `"postgresql"`.
2. Update `DATABASE_URL` and `DATABASE_PROVIDER` in `backend/.env`.
3. Run `npx prisma migrate dev` (plus data copy via pgloader or ETL).

No application code changes required.

## Frontend

- Two shells: the system dashboard (top navbar + sidebar) and a parallel tenant portal (`/tenant/login`, `/tenant/dashboard`, its own sidebar/topbar), both with a Sheet drawer on mobile.
- Theme: light / dark / system via `next-themes` toggle.
- System dashboard pages: `/system/login`, `/system/register`, `/system/dashboard`, plus full create/edit/delete management screens for System Users, Tenant Users, Roles, Permissions, and every tenant-scoped resource (Tenant Business, Mapped Business, Tax Types, Payment Modes, Income & Expense Categories, Business Branches, Network Providers, Mail Config, Places, Streets, Customers), plus a Customization (SaaS branding) page and a generic App Settings admin page.
- Tenant portal pages: `/tenant/dashboard`, `/tenant/users` (team management), `/tenant/customers`, and `/tenant/settings/*` — a self-service twin of each admin resource page, scoped to the caller's own business.
- **Permission-gated UI**: create/edit/delete/view actions and sidebar sections only render if the signed-in user's resolved permissions allow them (mirrors, but does not replace, backend RBAC enforcement).
- **Map-based location picker**: an OpenStreetMap/Leaflet picker (address search, draggable marker, live radius circle) embedded in the create/edit dialog for Places and Streets.
- **Animated + mobile-responsive**: page transitions, a sliding nav indicator, staggered stat cards, skeleton loading states, and animated table rows via `motion` (Framer Motion, respects `prefers-reduced-motion`); every admin table renders as stacked cards on mobile instead of a horizontally-scrolling table.
- API clients (`src/lib/api.ts` for system, `src/lib/tenant-api.ts` for tenant) send `x-device-type: website`, attach the Bearer token, and auto-refresh it once on 401 using the CSRF-protected refresh endpoint.
- Env: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_OSM_TILE_URL` in `frontend/.env.local`.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list
(database, JWT secrets/expiry, cookies, CORS, throttling, storage driver, S3, Swagger).

## Versioning

Each app follows [Semantic Versioning](https://semver.org/) independently,
tracked in its own `package.json` and `CHANGELOG.md`. Bump whichever app
changed; they don't need to move in lockstep.
