# Project 5 — System Console

[![Backend](https://img.shields.io/badge/backend-v1.2.0-blue)](./backend/CHANGELOG.md)
[![Frontend](https://img.shields.io/badge/frontend-v1.1.0-blue)](./frontend/CHANGELOG.md)

Full-stack system administration console with RBAC-driven CRUD for
system users, roles, and permissions.

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
- **RBAC**: `permissions` ⇄ `role_permissions` ⇄ `roles` ⇄ `system_users`. Routes declare `@RequirePermissions('roles:delete')`; a global guard resolves the user's role permissions per request. Full CRUD is exposed for all three resources.
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

- Responsive dashboard shell: top navbar + sidebar (Sheet drawer on mobile) + main content.
- Theme: light / dark / system via `next-themes` toggle.
- Pages: `/system/login`, `/system/register`, `/system/dashboard`, plus full create/edit/delete management screens for System Users, Roles, and Permissions.
- **Permission-gated UI**: create/edit/delete actions and sidebar sections only render if the signed-in user's resolved permissions allow them (mirrors, but does not replace, backend RBAC enforcement).
- API client (`src/lib/api.ts`) sends `x-device-type: website`, attaches the Bearer token, and auto-refreshes it once on 401 using the CSRF-protected refresh endpoint.
- Env: `NEXT_PUBLIC_API_URL` in `frontend/.env.local`.

## Environment variables

See `backend/.env.example` and `frontend/.env.example` for the full list
(database, JWT secrets/expiry, cookies, CORS, throttling, storage driver, S3, Swagger).

## Versioning

Each app follows [Semantic Versioning](https://semver.org/) independently,
tracked in its own `package.json` and `CHANGELOG.md`. Bump whichever app
changed; they don't need to move in lockstep.
