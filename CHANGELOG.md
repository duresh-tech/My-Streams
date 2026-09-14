# Changelog

A project-wide summary of notable changes. Each app keeps its own detailed,
independently versioned changelog:
[`backend/CHANGELOG.md`](./backend/CHANGELOG.md) and
[`frontend/CHANGELOG.md`](./frontend/CHANGELOG.md).

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Streaming servers and streams**: tenants register Flussonic servers,
  manage streams through the streamer API (create, edit, enable/disable,
  reload, adopt) with an HLS preview, assign servers to customers with stream
  limits, and view server stats.
- **Customer portal** (`/customer`): customers sign in to manage their own
  servers and streams, edit their profile, and see their invoice history
  (My Bills) and each service's bill status.
- **Billing**: subscription plans for a stream or a server; invoices with
  advance periods, tax, discounts, payment collection on create, part
  payments and cancellation (payments voided with it); billing settings per
  business.
- **Billing job**: runs on each business's own interval (Settings → Cron
  Jobs, with pause and Run now). It marks lapsed subscriptions past due and
  suspended, switches off customer streams without an active bill (after
  grace), switches paid streams back on, and corrects streams changed on the
  server outside the app. Tenants with `tenant-streams:override_billing` can
  keep a blocked stream on.
- **Income & expenses** ledger; every invoice payment books an income entry.
- **Stream events and email alerts**: servers send Source / Stream / Viewer
  events to a webhook through a Flussonic event sink; the Stream Events log
  (kept 30 days, auto-refreshing) and alert rules with scope, recipients,
  customer Bcc and cooldown.
- **Dashboards**: the System Console and Tenant Portal dashboards show
  insights and charts (Recharts) for the last 30 days, 90 days or 12 months:
  revenue and billing, streams and servers, customers, events and income &
  expense for tenants (by permission); growth, infrastructure, billing per
  currency and access for the platform.
- Backend unit tests (`npm test`) for billing maths, billing access, stream
  events and dashboard buckets.
- New backend env vars `APP_TIMEZONE` and `PUBLIC_API_URL`.

### Changed

- Any payment on an invoice activates its subscription; a service starting
  today starts at the moment it activates, and periods show date and time.
- A customer's place and street are plain text fields.

### Removed

- Places, Streets, Counters, Business Branches, Network Providers and QR
  Devices (DQ12) modules, their pages and permissions.

## 2026-07-13 — backend 1.6.0 · frontend 1.5.0

- Tenant mail config limited to one per account.
- DQ12 QR test screen shows the receiver name.

## 2026-07-09 — backend 1.5.0 · frontend 1.4.0

- Tenant Customers on both surfaces, with CSV import/export, status changes
  and a deleted view.
- Generic typed key-value App Settings replaced the branding singleton.
- Tenant uploads endpoint.

## 2026-07-08 — backend 1.4.0 · frontend 1.3.0

- Tenant Portal with its own auth, "Login as" for system admins, and
  tenant-scoped resources (business, mapped business, account, tax types,
  payment modes, income & expense categories, branches, network providers,
  mail config, places, streets, users).
- Map-based location picker, searchable comboboxes and row action menus.

## 2026-07-06 — backend 1.0.0–1.3.0 · frontend 1.0.0–1.2.0

- Initial NestJS + Prisma + MySQL backend and Next.js frontend: system auth,
  RBAC, users/roles/permissions CRUD, storage drivers, Swagger, API
  versioning.
- Tenant Business CRUD with restore; animated, mobile-responsive UI.
