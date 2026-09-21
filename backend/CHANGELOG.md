# Changelog

All notable changes to the backend are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **MP4 playback URL**: a stream with the `mp4` play protocol enabled now
  returns `<web>/<name>/index.mp4` in `urls.outputs` - the protocol could be
  enabled but had no URL to play from.
- **Dashboard insights** (read-only, no schema change):
  - `GET /tenant/dashboard/overview?range=30d|90d|12m`
    (`tenant-dashboard:view`): buckets (30 days, 13 weeks or 12 months in the
    app timezone) and sections `billing` (collected series, outstanding,
    overdue, invoice statuses, plans expiring in 7 days), `streams` (running,
    off by billing, off by a user, per server, server connections), `customers`
    (new series, with/without an active bill), `events` (Source/Stream/Viewer
    series, alert results) and `incomeExpense` (income/expense series, net).
    Each section is `null` unless the caller holds its list permission.
  - `GET /system/dashboard/overview?range=` (`dashboard:view`): growth
    (businesses, tenant users, customers, top businesses), infrastructure
    (server connections, stream states, unreachable servers), billing per
    currency (never summed across currencies) and access (active system,
    tenant and customer sessions; distinct users signing in per bucket).
  - `common/utils/dashboard-buckets.ts` with unit tests.
- **Stream events and email alerts** (`tenant-stream-events` module;
  `tenant_stream_events`, `tenant_event_alert_rules`,
  `tenant_event_alert_cooldowns` tables; `eventsEnabled`, `eventTypes`,
  `eventWebhookToken`, `eventSinkSyncedAt`, `eventSinkError` on
  `tenant_flussonic_servers` - all additive):
  - Streaming servers: `eventsEnabled` and `eventTypes` (Flussonic 24.03
    names: `source_opened|connected|started|updated|closed`,
    `stream_opened|updated|closed`, `play_opened|started|updated|closed`) on
    create/update. Saving creates, updates or removes an event sink
    `mystreams-<serverId>` on the server with
    `only: [{ event: [...] }]`, posting to
    `PUBLIC_API_URL/webhooks/flussonic/:serverId/:token`. A failed sync never
    fails the save; it is reported as `eventSinkError`.
    `GET /tenant/streaming-servers/event-options`,
    `POST /tenant/streaming-servers/:id/event-sink/sync`.
  - Webhook `POST /webhooks/flussonic/:serverId/:token`: token-authenticated,
    exempt from the device header and rate limiting, accepts one event, an
    array or `{ events }` (max 1000), stores them, matches them to managed
    streams and customers, and processes alerts after responding. JSON body
    limit raised to 5 MB.
  - Alert rules `tenant/event-alerts` (CRUD, `options`, `:id/test`): events
    (0:N), scope by servers/streams/customers (empty = all), recipients,
    `customerRecipients` (`NONE`, `STREAM_OWNER`, or `SERVER_CUSTOMERS` - the
    owner plus every customer actively assigned to the stream's server,
    always by Bcc), and a per-stream cooldown. Emails go
    through the business's mail config (`common/utils/mail.util.ts`, now also
    used by the mail config test email).
  - Event log `GET /tenant/stream-events` (+ `options`), kept 30 days by a
    daily cleanup.
  - Permissions `tenant-event-alerts:list/view/create/update/delete`,
    `tenant-stream-events:list`, granted to `TENANT_ADMIN`. New env
    `PUBLIC_API_URL` (see `.env.example`).

### Changed

- **Any payment activates a subscription** (`activateOn = PAYMENT`):
  recording any amount on an invoice now puts its subscription into effect
  and enables the stream; previously only a payment in full did. Each billing
  job run also activates subscriptions still awaiting payment on invoices
  that already carry money (`PARTIALLY_PAID` or `PAID`), so invoices part-paid
  before this change come on at the next run. Job results add `activated`.

- **Billing job enables paid streams**: a customer stream with a valid bill
  (ACTIVE, or within grace) that is switched off is switched on again,
  whoever switched it off - previously only streams billing itself had
  switched off came back. Paid streams switched off on the streaming server
  outside this app are switched on again too
  (`TenantStreamSyncService.ensureRemoteState`, replacing
  `ensureRemoteDisabled`). Job results add `streamsReEnabled`.

### Fixed

- **Blocked streams re-enabled on the streaming server**: the billing job
  trusted its own `disabled` flag, so a blocked stream switched back on
  outside this app (for example in the server's own UI) kept running while
  the app showed it as off. Each run now reads every blocked customer stream
  from its server and switches it off again if it is enabled
  (`TenantStreamSyncService.ensureRemoteDisabled`). Job results add
  `streamsBlocked` and `streamsReDisabled`.
- **Customer portal stream access**: a stream attached to the customer can be
  opened (view, stats, sessions) even when the customer has no active
  assignment on its server - previously it was listed on My Streams but
  opening it failed with "You no longer have access to the server this stream
  is on". Edit, enable, reload and delete are governed by the billing rule;
  creating a stream still requires an assignment for its quota.

### Removed

- **Places and streets** (`tenant-places`, `tenant-streets` modules, their
  `tenant_places` / `tenant_streets` tables and permissions). A customer's
  `place` and `street` are now free-text `VARCHAR(150)` columns replacing
  `tenantPlaceId` / `tenantStreetId` on customers, CSV import/export and the
  customer portal profile; `GET /tenant/customers/places|streets`,
  `/system/tenant-customers/places|streets` and `/customer/places|streets`
  are gone, and customer search also matches place and street. The seed
  removes the old permissions and their role grants.

### Added

- **Billing job per business** (`tenant_billing_settings.lifecycleIntervalMinutes`,
  `lifecyclePaused`, `lifecycleLastRunAt`, `lifecycleLastResult`, additive):
  the scheduler ticks every minute and runs the job only for businesses that
  are due by their own interval (1, 5, 10, 15, 30 or 60 minutes, or 6, 12 or
  24 hours; default 5) and not paused. Each run records its time and counts
  (past due, suspended, streams disabled / enabled, failures) or its error.
  `GET /tenant/billing-settings/job` returns the schedule with last and next
  run; `POST /tenant/billing-settings/job/run` (`tenant-billing-settings:update`)
  runs it now, even while paused, and returns 409 if it is already running.
  A business without a settings row gets the defaults on the first tick.

- **Billing enforcement on customer streams** (`tenant-billing/billing-access.ts`,
  with tests): a customer stream is ACTIVE while its own STREAM plan or the
  SERVER plan on its server has an unexpired period, GRACE for the business's
  `graceDays` after that, and BLOCKED otherwise - including streams never
  billed. The tenant's own streams are unaffected.
  - Customer portal: edit, enable, reload and delete on a BLOCKED stream
    return 403 (disable is always allowed); `GET /customer/streams`,
    `/streams/:id` and `/streams/:id/view` carry `access`. A stream created on
    a server without an active plan starts disabled.
  - Tenant portal: enabling a BLOCKED customer stream needs the new
    `tenant-streams:override_billing` (granted to `TENANT_ADMIN`) and marks it
    `billingExempt` until a covering subscription is active again or a user
    disables it.
  - `BillingLifecycleService` (`@nestjs/schedule`, on each business's own
    interval - see Billing job - one runner via MySQL `GET_LOCK`): lapsed subscriptions become
    `PAST_DUE`, then `SUSPENDED` after grace; blocked streams are disabled on
    the server and marked `billingDisabledAt`; streams billing disabled are
    re-enabled once covered. Creating an invoice, recording a payment and
    cancelling apply the result to that customer's streams immediately.
  - Schema: `tenant_streams.billingDisabledAt`, `tenant_streams.billingExempt`
    (additive).
- **Exact service periods**: a new subscription starting today starts at the
  moment its invoice activates (payment, or issue), not midnight; a renewal
  paid after suspension starts at payment. The invoice line's period moves
  with it. Past start dates are refused.

- **Bill ahead and collect on create** (`POST /tenant/invoices`, `/preview`):
  `periods` (1-24, default 1) bills that many plan durations on one line,
  for new subscriptions and renewals alike; period ends stay on the
  anchor schedule (`nextPeriods` in `billing-math.ts`, with tests). An
  optional `payment` is recorded in the same transaction as the invoice
  (requires `tenant-payments:create`).
- **Invoice cancel** (`POST /tenant/invoices/:id/void`): now allowed on
  `ISSUED`, `PARTIALLY_PAID` and `PAID` invoices. Recorded payments are
  voided with it (requires the new `tenant-payments:void`) and
  `amountPaid` returns to 0. Refused while a later invoice bills the same
  subscription.
- **Income & expense ledger** (`tenant-income-expenses` module,
  `tenant_income_expenses` table): list/summary/view/create/update/delete
  under `tenant/income-expenses`, scoped to the caller's business, with
  permissions `tenant-income-expenses:list/view/create/update/delete`
  granted to `TENANT_ADMIN`. Every recorded invoice payment books an income
  entry under an "Invoice Payment" category (created per business on first
  use); those entries are read-only and are voided with their payment.
- **Customer billing** (`customer/billing/invoices`, `/invoices/:id`): the
  customer's own non-draft invoices with lines and recorded payments.
  `GET /customer/servers` and `/customer/streams` now include a `billing`
  summary (plan, status, period end, unpaid invoice); a stream without its
  own plan shows the server plan covering it.

- **Billing, Phase 1** (`docs/billing-plan.md`): the foundation for selling
  subscription plans to customers.
  - **Schema**: `tenant_billing_settings`, `tenant_subscriptions`,
    `tenant_invoices`, `tenant_invoice_items`, `tenant_payments`, plus
    back-relations on business, customer, plan, server, customer-server
    assignment, tax type and payment mode. Additive only. Subscriptions
    snapshot the plan's limits and price at purchase; invoice items carry a
    `@@unique([tenantSubscriptionId, periodStart])` so a renewal can never be
    billed twice; commercial records have no `DELETED` status (they are
    cancelled or voided).
  - **Billing settings** (`tenant-billing` module): `GET/PATCH
    /tenant/billing-settings` and the system twin `GET/PATCH
    /system/tenant-billing-settings/:tenantBusinessId`. One row per
    business, created with defaults on first read. Currency is validated
    against ISO 4217, the default tax type must be an `ACTIVE` tax type of the
    same business, and `nextInvoiceNumber` is refused once the business has
    issued an invoice (`invoiceNumberLocked` in the response).
  - **Permissions**: `tenant-billing-settings:view`, `:update`, granted to
    `TENANT_ADMIN`. The remaining billing permissions are seeded with the
    phase that gates them.
  - **`billing-math.ts`**: calendar-correct period arithmetic in the app
    timezone (month-end clamping, DST-safe days), per-line half-up Decimal
    tax and totals, and invoice-number formatting.
- **Invoices for streams and servers** (`tenant/invoices`, tenant surface
  only):
  - `POST /tenant/invoices/preview` and `POST /tenant/invoices` bill an
    assigned customer's **stream** (STREAM plan — exactly one stream) or
    **server assignment** (SERVER plan). The invoice is issued immediately
    with the next gapless number (the settings row is locked `FOR UPDATE`).
    Expiry = start date (default today, midnight in `APP_TIMEZONE`) + plan
    duration, month-end clamped. A target with an active subscription is
    renewed instead: from its current expiry, at the price it was
    subscribed at, anchored to the first period so Jan 31 renews to Feb 28
    and then Mar 31.
  - One open invoice per stream/server: another is refused until the first
    is paid or voided.
  - `POST /tenant/invoices/:id/payments` records full or partial payments.
    Paying in full — or issuing, when `activateOn=ISSUE` or the total is
    zero — activates the subscription for the invoiced period and, for
    SERVER plans, sets the assignment's `streamLimit` (left unchanged, with
    a warning, if the customer already runs more streams).
  - `POST /tenant/invoices/:id/void` for issued, unpaid invoices: cancels
    the subscription it opened or rolls back the renewal it activated.
    Stream limits already applied are not reverted.
  - `GET /tenant/invoices`, `GET /tenant/invoices/:id`, and form options:
    `options`, `options/customers`, `options/customers/:customerId/billables`,
    `options/payment-modes`.
  - Schema: `tenant_subscriptions.tenantStreamId`.
  - Permissions: `tenant-invoices:list|view|create|void|add_discount` and
    `tenant-payments:create`, granted to `TENANT_ADMIN`. A discount requires
    `add_discount`.
  - `billing-math.ts`: `startOfDate`, `calendarDate`, `nextPeriod`, with 7
    more tests (27 total).
- **`npm test`**: Node's built-in test runner via `ts-node`, no new
  dependency. Specs live in `backend/test/` so `nest build` does not compile
  them. First suite: 20 tests for `billing-math.ts`.

## [1.6.0] - 2026-07-13

### Fixed

- **Tenant Mail Config**: tenant self-service `POST /tenant/mail-config`
  now rejects a second config with a 400 (`Only one mail config is
  allowed per account...`) if the caller's business already has a
  non-deleted one — previously nothing stopped a tenant from creating
  several, even though only one was ever actually used to send mail.
  System-admin creation (`POST /system/tenant-mail-config`) is
  unaffected and still allows multiple.

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

[Unreleased]: ../../compare/backend-v1.6.0...HEAD
[1.6.0]: ../../compare/backend-v1.5.0...backend-v1.6.0
[1.5.0]: ../../compare/backend-v1.4.0...backend-v1.5.0
[1.4.0]: ../../compare/backend-v1.3.0...backend-v1.4.0
[1.3.0]: ../../compare/backend-v1.2.0...backend-v1.3.0
[1.2.0]: ../../compare/backend-v1.1.0...backend-v1.2.0
[1.1.0]: ../../compare/backend-v1.0.0...backend-v1.1.0
[1.0.0]: ../../releases/tag/backend-v1.0.0
