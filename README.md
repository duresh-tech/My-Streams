# My Streams

[![Backend](https://img.shields.io/badge/backend-v1.6.0-blue)](./backend/CHANGELOG.md)
[![Frontend](https://img.shields.io/badge/frontend-v1.5.0-blue)](./frontend/CHANGELOG.md)

A multi-tenant SaaS for selling and running live streams on Flussonic
media servers, with three separately authenticated surfaces:

- **System Console** (`/system`): RBAC-driven administration of system users,
  roles, permissions, tenants and their resources, app settings, and a
  platform-wide insights dashboard.
- **Tenant Portal** (`/tenant`): each tenant manages their own business —
  team members, customers, streaming servers and streams, subscription
  plans, invoices and payments, income & expenses, stream events and email
  alerts, and settings (tax types, payment modes, income & expense
  categories, mail config, billing, cron jobs).
- **Customer Portal** (`/customer`): a tenant's customers see and manage
  their own servers and streams (with billing status) and their invoice
  history.

Changes across the whole project are summarised in
[`CHANGELOG.md`](./CHANGELOG.md).

| Layer    | Stack                                                             |
| -------- | ----------------------------------------------------------------- |
| Frontend | Next.js 15 (App Router) · React 19 · Tailwind CSS v4 · shadcn/ui · Recharts |
| Backend  | NestJS 10 · TypeScript · Prisma ORM · Passport JWT · Zod · `@nestjs/schedule` |
| Streaming | Flussonic Media Server (streamer API v3, event sinks)            |
| Database | MySQL (driver-based via env; PostgreSQL-ready schema)             |
| Storage  | Driver-based: local public folder or cloud S3 (paths only in DB)  |

```
my-streams/
├── backend/    NestJS REST API  → http://localhost:4000/api/v1  (Swagger: /docs)
│               README.md · CHANGELOG.md · test/ (npm test)
├── frontend/   Next.js app      → http://localhost:3000
│               README.md · CHANGELOG.md
├── docs/       Design plans (billing, stream management)
├── README.md
└── CHANGELOG.md  Project-wide summary
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
npm test                  # unit tests (Node test runner)
npm run dev               # http://localhost:4000

# Frontend (second terminal)
cd frontend
npm install
npm run dev               # http://localhost:3000
```

Default super admin (from seed): **admin** / **Admin@12345** (admin@system.local).
Login pages: `http://localhost:3000/system/login` (→ `/system/dashboard`),
`/tenant/login` (→ `/tenant/dashboard`) and `/customer/login`.

After changing `schema.prisma`, stop the backend before `npx prisma generate`
— on Windows the running dev server locks the Prisma query engine.

## Backend

- **API versioning**: URI-based, driven by the `API_VERSION` env var (defaults to `1` → `/api/v1`). System-user routes live under `/api/v1/system/...`.
- **Swagger / OpenAPI**: `http://localhost:4000/docs` — every endpoint documented (operations, params, responses with JSON examples, bearer auth, global `x-device-type` header). Keep decorators updated on every endpoint change.
- **Auth (Passport.js)**: JWT access token (Bearer, 15 min) + rotating refresh token (httpOnly cookie, 7 days, SHA-256 hash stored in `refresh_tokens`). `POST /system/login`, `/system/register`, `/system/refresh`, `/system/logout`, `GET /system/me`.
- **Tenant portal & auth**: a fully parallel, namespaced auth audience (own JWT strategy, refresh-token table, and cookie names) so a tenant session and a system-admin session coexist in the same browser. `POST /tenant/login`, `GET /tenant/me`, `GET /tenant/dashboard`. System admins can also "Login as" any tenant user.
- **Customer portal & auth**: a third audience for a tenant's customers — `POST /customer/auth/login`, `/refresh`, `/logout`, `GET /customer/auth/me` — with their own servers, streams, profile and invoices (`/customer/billing/invoices`).
- **RBAC**: `permissions` ⇄ `role_permissions` ⇄ `roles` ⇄ `system_users`/`tenant_users`. System routes declare `@RequirePermissions('roles:delete')`; tenant routes use the parallel `@RequireTenantPermissions()`, evaluated by an independent guard. Full CRUD is exposed for permissions, roles, system users, and every tenant-scoped business resource (business, mapped business, tax types, payment modes, income & expense categories, mail config, customers, and tenant users themselves via self-service).
- **Streaming servers & streams**: tenants register Flussonic servers and manage streams through the streamer API (create, edit, enable/disable, reload, adopt existing streams), assign servers to customers with stream limits, and check server stats.
- **Billing**: subscription plans for a stream or a server; invoices with multiple periods (bill ahead), tax, discounts, full or part payments and cancellation; per-business billing settings. A scheduled **billing job** (interval set per business in Settings → Cron Jobs) moves lapsed subscriptions to past due and suspended, switches off unbilled customer streams on the server, switches paid ones back on, and corrects streams changed outside the app. Payments book entries in the **income & expense** ledger.
- **Stream events & alerts**: saving a server configures a Flussonic event sink that posts Source / Stream / Viewer events to `POST /webhooks/flussonic/:serverId/:token` (needs `PUBLIC_API_URL`). Events are logged for 30 days and matched against tenant email alert rules (scope, recipients, customer Bcc, cooldown).
- **Dashboards**: `GET /system/dashboard/overview` and `GET /tenant/dashboard/overview` return range-bucketed insights (30 days, 13 weeks or 12 months) from the database only; tenant sections follow the caller's permissions, and money is never summed across currencies.
- **App Settings**: a generic typed key-value config store (`app_settings` — `key`, `dataType`, `value`, `description`, soft-delete `status`) replaces the old fixed-shape branding singleton. A stable public `GET /system/app-settings/public/branding` endpoint keeps the app name/logo contract unchanged for every consumer.
- **Dual-surface CRUD pattern**: each tenant-scoped resource is one Prisma model + one shared service, exposed through a system-admin controller (unrestricted) and a tenant self-service controller (scoped to the caller's own mapped business via `tenant_mapped_business`), sharing one permission-key namespace.
- **Validation**: Zod schemas via `nestjs-zod` (global pipe), surfaced in Swagger.
- **Security**: Argon2id password hashing · helmet security headers · CORS restricted to `CORS_ORIGINS` · rate limiting (global 100/min, login 5/min) · CSRF double-submit (cookie `csrf_token` + header `x-csrf-token` on cookie-based endpoints) · SQL injection prevented by Prisma parameterized queries · mandatory `x-device-type` header (`website | androidApp | iosApp | desktopApp`).
- **Storage**: `STORAGE_DRIVER=local|s3`. Local files go to `public/uploads` (served at `/uploads`); S3 uses `@aws-sdk/client-s3`. Only the **path** is stored, never a URL. Upload endpoint: `POST /system/uploads`.
- **IDs & timestamps**: UUIDv7 primary keys, unique human-readable `systemCode` per record, UNIX-timestamp `createdAt/updatedAt/deletedAt` columns, soft deletes via `status=DELETED`. Calendar maths (billing periods, dashboard buckets) uses `APP_TIMEZONE`.

### MySQL → PostgreSQL migration (at 1000+ customers)

The schema is engine-portable by design (CHAR(36) UUIDs, BIGINT unix timestamps, native enums, no vendor types):

1. In `backend/prisma/schema.prisma` change `provider = "mysql"` → `"postgresql"`.
2. Update `DATABASE_URL` and `DATABASE_PROVIDER` in `backend/.env`.
3. Run `npx prisma migrate dev` (plus data copy via pgloader or ETL).

No application code changes required.

## Frontend

- Three shells: the system console (top navbar + sidebar), the tenant portal and the customer portal, each with its own login and a Sheet drawer on mobile. Installable as a PWA.
- Theme: light / dark / system via `next-themes` toggle.
- System console pages: `/system/login`, `/system/register`, `/system/dashboard` (insights with charts), plus management screens for System Users, Tenant Users, Roles, Permissions, Streaming Servers and every tenant-scoped resource (Tenant Business, Mapped Business, Tax Types, Payment Modes, Income & Expense Categories, Mail Config, Customers), plus a generic App Settings admin page.
- Tenant portal pages: `/tenant/dashboard` (permission-driven insights with charts), `/tenant/users`, `/tenant/customers`, `/tenant/customer-servers`, `/tenant/streaming-servers`, `/tenant/streams` (with HLS preview), `/tenant/subscription-plans`, `/tenant/billing/invoices`, `/tenant/billing/income-expenses`, `/tenant/stream-events`, and `/tenant/settings/*` (including Billing, Cron Jobs and Event Alerts).
- Customer portal pages: `/customer/streams`, `/customer/servers`, `/customer/billing` (My Bills) and `/customer/profile`.
- **Charts**: Recharts with theme tokens `--viz-1..3`, `--viz-grid`, `--viz-axis` (separate light and dark values); every chart has a Table view.
- **Permission-gated UI**: create/edit/delete/view actions and sidebar sections only render if the signed-in user's resolved permissions allow them (mirrors, but does not replace, backend RBAC enforcement).
- **Map-based location picker**: an OpenStreetMap/Leaflet picker (address search, draggable marker, live radius circle) embedded in the customer create/edit dialog.
- **Animated + mobile-responsive**: page transitions, a sliding nav indicator, staggered stat cards, skeleton loading states, and animated table rows via `motion` (Framer Motion, respects `prefers-reduced-motion`); every admin table renders as stacked cards on mobile instead of a horizontally-scrolling table.
- API clients (`src/lib/api.ts` for system, `src/lib/tenant-api.ts` for tenant, `src/lib/customer-api.ts` for customer) send `x-device-type: website`, attach the Bearer token, and auto-refresh it once on 401 using the CSRF-protected refresh endpoint.
- Env: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_OSM_TILE_URL` in `frontend/.env.local`.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list
(database, JWT secrets/expiry, cookies, CORS, throttling, storage driver, S3, Swagger).
Notable backend additions: `APP_NAME` (branding), `APP_TIMEZONE` (billing and
dashboard calendar, e.g. `Asia/Kolkata`), `ENCRYPTION_KEY` (streaming server
credentials) and `PUBLIC_API_URL` (the backend's public URL, used as the
Flussonic event webhook target — events are not configured while it is empty).

## Versioning

Each app follows [Semantic Versioning](https://semver.org/) independently,
tracked in its own `package.json` and `CHANGELOG.md`. Bump whichever app
changed; they don't need to move in lockstep.
