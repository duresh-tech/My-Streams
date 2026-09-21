# Changelog

All notable changes to the frontend are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- **Dashboards with charts** (Recharts): `/tenant/dashboard` and
  `/system/dashboard` have a 30 days / 90 days / 12 months range, KPI tiles,
  column and line charts (each with a Table view), labelled bar lists and
  attention lists. The tenant dashboard shows only the sections the role may
  list (billing, streams and servers, customers, stream events, income and
  expense); the system dashboard covers growth, infrastructure, billing per
  currency and access. Chart colors are the `--viz-1..3`, `--viz-grid` and
  `--viz-axis` tokens, with separate light and dark steps.
- **Stream events**: the streaming server form has a "Receive stream events"
  section with Source / Stream / Viewer event checkboxes (viewer events off by
  default, with a traffic warning), the server-side setup status and a Retry.
- **Event Alerts** (Settings → Event Alerts, `tenant-event-alerts:list`):
  email rules picking any number of events, optional server / stream /
  customer scope, recipients, customer recipients (none, the stream owner, or
  the owner plus every customer assigned to the stream's server - Bcc'd), a
  per-stream cooldown, and Send test. The rule dialog is wide (5xl) with
  aligned, taller scope lists. Warns when no mail config exists or when no server
  in scope sends a chosen event.
- **Stream Events** log (`/tenant/stream-events`, `tenant-stream-events:list`):
  filters by server, event, alert result and date, with the raw event payload.
  Auto refreshes every 30 seconds (toggleable) without clearing the table,
  paused while a payload is open or the tab is hidden
  (`useResourceList().refreshSilently`).
- **Stream page** (`/tenant/streams/[id]`): Refresh also reloads the HLS
  preview player.

### Changed

- **Play sessions** (`/tenant/streams/[id]`): a Watching column shows how long
  each viewer has been connected, the badge counts viewers rather than
  sessions, and sessions that have transferred no data are hidden (the count
  of hidden ones is shown beside the badge).
- **Stream page** (`/tenant/streams/[id]`): the input and output protocol
  rows are mobile-friendly - the URL wraps onto its own full-width line
  instead of being truncated - and HLS, CMAF, DASH and MP4 playback URLs
  have an Open in a new tab button next to Copy.
- **Home page** (`/`) redirects to the customer login (`/customer/login`)
  instead of the System Console login. `/system` redirects to
  `/system/login` and `/tenant` to `/tenant/login` (previously 404).

### Removed

- **Places and Streets** settings pages (tenant portal and System Console)
  and their navigation entries. Customer forms and the customer portal
  profile take place and street as plain text inputs.

### Added

- **Cron Jobs** (`/tenant/settings/cron-jobs`, "Cron Jobs" in the Settings
  menu, `tenant-billing-settings:view`): choose how often the billing
  job runs for your business (every minute to every 24 hours), pause
  scheduled runs, run it now, and see when it last ran, what it did, and when
  it runs next (refreshed every 30 seconds). Changing it needs
  `tenant-billing-settings:update`.

- **Billing-blocked streams in the customer portal**: My Streams and the
  stream page show "Blocked · no active bill" or "Grace until …", and edit,
  enable, reload and delete explain the block instead of calling the API.
- **Service periods with time**: invoice periods, subscription periods, the
  new-invoice summary and "Paid until" badges show date and time. The
  new-invoice start date cannot be in the past and explains that today starts
  when the invoice activates.

- **New invoice**: a "Periods to bill" field for advance invoices, and a
  "5. Payment" step (with `tenant-payments:create`) to record a full or
  part payment while issuing; the summary shows what is paid now and the
  balance after.
- **Cancel invoice**: replaces Void on the invoice page and is offered in
  the invoice list's row actions. Paid invoices can be cancelled with
  `tenant-payments:void`; their payments are voided too. "Void" now reads
  "Cancelled" everywhere.
- **Income & Expenses** (`/tenant/billing/income-expenses`, Billing
  sidebar, `tenant-income-expenses:list`): ledger with type and date
  filters, income/expense/net totals, and add/edit/delete gated by
  permission. Entries booked from invoice payments link to their invoice
  and cannot be edited.
- **Customer portal**: **My Bills** (`/customer/billing`) with the invoice
  history, total due and a read-only invoice view; bill-status badges
  (paid until, expired, awaiting payment, amount due) on My Servers and My
  Streams.

- **Billing settings** (`/tenant/settings/billing`, "Billing" in the
  Settings sidebar, gated by `tenant-billing-settings:view`): currency
  (searchable ISO 4217 picker), default tax type, invoice prefix and next
  number with a live preview of the next invoice number, payment due days,
  invoice footer, and the subscription rules — activate on payment or on
  issue, renewal invoice lead days, and grace period. The next-number field
  locks with an explanation once an invoice has been issued. Read-only
  without `tenant-billing-settings:update`.
- **Invoices** (new **Billing → Invoices** sidebar entry, gated by
  `tenant-invoices:list`):
  - `/tenant/billing/invoices`: list with a status filter, overdue badge,
    total and balance.
  - `/tenant/billing/invoices/new`: customer → stream or server → plan and
    start date → tax and discount. A live, server-calculated summary shows
    the service period (start → expiry), tax, total, due date, and when the
    subscription activates. Renewals are detected automatically and keep
    the plan; an unpaid invoice on the target is linked instead of billed
    again.
  - `/tenant/billing/invoices/[id]`: the invoice (from/to, lines with period
    and expiry, totals, balance), the subscription's status and expiry,
    payments, and Record payment (partial allowed) and Void dialogs, each
    permission-gated.

## [1.5.0] - 2026-07-13

### Added

- **DQ12 custom QR test screen** (`/tenant/settings/qr-devices`): the
  composer now also passes the receiver name through to
  `renderQrScreen()`, drawn on the generated preview/test canvas beneath
  the amount — previously only the amount and UPI ID were shown.

### Fixed

- **Mail Config** (`/tenant/settings/mail-config`): the "Add Mail Config"
  button now hides once the tenant already has one config, instead of
  just being permission-gated — mirrors the backend's new one-config-
  per-account limit so the button no longer opens a create dialog that's
  guaranteed to fail with a 400.

## [1.4.0] - 2026-07-09

### Added

- **Tenant Customers** pages, both surfaces: `/system/dashboard/tenant-customers`
  (all businesses, with a Business filter) and `/tenant/customers`
  (top-level nav item, like Users — not under Settings). A cascading
  Business → Place → Street `Combobox` chain feeds the map picker's
  reference circle; picture and ID-proof file inputs upload via the new
  generic upload endpoints and store just the returned path. Toolbar adds
  CSV Export/Import buttons (Import shows a results dialog listing
  per-row errors) and a "Change Status" row action separate from Edit/
  Delete/Restore. A "View Deleted" toggle (tenant side) / a "Deleted"
  status-filter option (system side) switches to the dedicated
  soft-deleted list, gated by the new `view_deleted` permission.
- **App Settings** admin page (`/system/dashboard/app-settings`): generic
  list/create/edit/delete/restore for the redesigned key-value config
  store, with a Value input that switches control per selected Data Type
  (text/textarea/number/Yes-No select/date-time pickers) and Key/Data
  Type locked once a row is created.

### Changed

- **Customization page** now reads/writes the `app.name`/`app.logo_path`
  keys through the new App Settings API instead of the old singleton
  endpoint — same UI, same behavior, permission checks moved from
  `system-settings:*` to `app-settings:*`.

## [1.3.0] - 2026-07-08

A tenant-facing portal alongside the existing system console, plus a full
set of tenant self-service settings pages mirroring their system-admin
counterparts.

### Added

- **Tenant portal**: `/tenant/login`, `/tenant/dashboard`, and a
  `TenantShell` layout (sidebar + top navbar + mobile drawer) parallel to
  the system dashboard shell. `useTenantSession()` (Context provider) and
  a namespaced `tenantApi` client keep a tenant session and a system-admin
  session independent in the same browser.
- **Tenant Settings** (`/tenant/settings/*`), permission-gated via a
  dedicated sub-nav: Account Settings (profile/phone/avatar), Business
  Information, Business Branches, Network Providers, Tax Types, Payment
  Modes, Income & Expense Categories, Mail Config, Places, Streets.
- **`/tenant/users`**: tenant admins manage the team members mapped to
  their own business (list/create/edit/delete/view), sidebar-linked from
  the tenant portal.
- **System dashboard admin pages** for every new resource: Tenant
  Business, Tenant Mapped Business, Tenant Tax Types, Tenant Payment
  Modes, Tenant Income & Expense Categories, Tenant Business Branches,
  Tenant Network Providers, Tenant Mail Config, Tenant Places, Tenant
  Streets, plus a Customization page (SaaS branding: app name/logo) under
  a new "Settings" sidebar section.
- **OpenStreetMap/Leaflet location picker** (`location-picker-panel.tsx`,
  `location-picker/leaflet-map.tsx`): address search via Nominatim, a
  draggable marker, and a live radius circle, swapped into the existing
  create/edit dialog instead of a nested `Dialog` (avoids a Radix
  dialog-stacking conflict). Streets additionally frames the parent
  Place's location/radius as a reference circle.
- **Searchable `Combobox`** (Popover + Command): replaces every plain
  scrollable `Select` used for business/tenant-user/role pickers across
  system and tenant-settings pages.
- **`RowActionsMenu`**: collapses per-row action buttons into a single
  "..." dropdown across every resource table (Edit/Delete/Restore/Login
  as/View, filtered to whichever the row and caller's permissions allow).
- **Row-detail "View" modals** (read-only, with an Edit shortcut),
  permission-gated by a dedicated `*:view` key: Tenant Business, Tenant
  Mapped Business, and both Tenant Users pages (system admin + tenant
  self-service).
- Role permission picker now groups permissions by module, with a
  per-module select-all (indeterminate when partially selected) and a
  search filter.
- `useAppSettings()` shows the configured app name as an eyebrow label
  above every `ResourceTable` title.
- System-admin "Login as" action opens the tenant portal in a new tab,
  signed in as the selected tenant user.

### Changed

- `useSession()`/`useTenantSession()` converted to Context providers so
  `/system/me`/`/tenant/me` are fetched once per navigation instead of
  once per consuming component (layout, nav, and page each used to fire
  their own request).
- `useResourceList` accepts an optional fetcher argument, so tenant-facing
  pages can point it at `tenantApi` instead of the system API client.
- Tenant Mapped Business simplified to one business per tenant user: a
  single searchable business picker instead of a multi-select checklist,
  and the admin table is now one row per mapping instead of grouped by
  user.

### Fixed

- Searchable `Combobox` didn't receive clicks or keystrokes while open
  inside a `Dialog` — a Radix Popover/Dialog focus-scope conflict caused
  by two divergent resolved versions of `@radix-ui/react-focus-scope`;
  fixed by setting the Popover's `modal` prop and deduping the package
  version.
- Hydration mismatch warning caused by browser extensions (e.g.
  Colorzilla) injecting attributes onto `<body>` before React hydrates.

## [1.2.0] - 2026-07-06

### Added

- Animated UI throughout via `motion` (Framer Motion): crossfade page
  transitions between dashboard sections, a sliding active-indicator in
  the sidebar nav, staggered dashboard stat cards, animated resource-table
  row enter/exit and loading/error/empty state crossfades, and entrance +
  shake-on-error animations on the login/register cards. Respects the OS
  "reduce motion" preference via `MotionConfig`.
- New `Skeleton` UI primitive (`components/ui/skeleton.tsx`).
  `ResourceTable`'s loading state now renders skeleton rows (desktop) or
  skeleton cards (mobile) matching the real layout instead of a bare
  spinner, and the dashboard's auth-guard loading state is a skeleton of
  the whole shell (sidebar, header, stat cards) instead of a spinner too.
- `ResourceTable` is mobile-responsive: below the `sm` breakpoint, System
  Users, Roles, and Permissions render as stacked cards instead of a
  horizontally-scrolling table.
- New Tenant Business admin page (`/system/dashboard/tenant-business`):
  full create/edit/delete/restore UI with status/country filters and
  column sorting, permission-gated like every other admin page. Includes
  a logo upload control — the first file-upload widget in the frontend,
  backed by the existing `/system/uploads` endpoint.

### Changed

- Default dialog width increased (`sm:max-w-lg` → `sm:max-w-2xl`) for
  create/edit modals; the Roles dialog widened further to `sm:max-w-3xl`
  for its permissions checklist. The delete-confirmation dialog keeps the
  previous compact width.
- Buttons show a subtle press/scale animation on click.
- `useResourceList` now accepts an optional second `filters` argument
  merged into the list query string (used by the Tenant Business page's
  status/country filters and sorting); existing callers are unaffected.

### Fixed

- Two-column form grids in the Users/Roles/Permissions create/edit
  dialogs didn't collapse on mobile (`grid-cols-2` with no `sm:`
  breakpoint), cramping fields on small screens.

## [1.1.0] - 2026-07-06

### Added

- Full create / edit / delete UI for System Users, Roles, and Permissions,
  each gated by the signed-in user's actual permission set (no create
  button, edit action, or delete action renders unless the backend grants
  that permission key).
- Sidebar navigation filters itself to only the sections the user has
  `*:read` access to.
- New shadcn/ui primitives: `Dialog`, `Select`, `Checkbox`, `Textarea`.
- `useSession().hasPermission(key)` helper for permission checks in
  components.
- `useResourceList` hook: pagination, search, and manual refresh for any
  list endpoint.
- Role edit form: scrollable multi-select checklist of all permissions.
- User edit form: role dropdown, optional password field, status control.
- Guardrails mirrored from the backend in the UI: system records
  (`isSystem: true`) lock their key fields and disable delete; a role
  with active users, or your own account, cannot be deleted from the UI.

### Changed

- `ResourceTable` is now a presentational component (rows/pagination/search
  passed in as props) with an optional toolbar action slot and per-row
  actions column, decoupled from data fetching.

## [1.0.0] - 2026-07-06

### Added

- Initial Next.js 15 (App Router) + Tailwind CSS v4 + shadcn/ui scaffold.
- `/system/login` and `/system/register` pages; login redirects to
  `/system/dashboard`.
- Dashboard shell: responsive top navbar + sidebar (mobile slide-out
  `Sheet`) + main content area, with a stats overview page.
- Read-only, paginated, searchable list pages for System Users, Roles,
  and Permissions.
- Light / dark / system theme toggle via `next-themes`.
- API client (`src/lib/api.ts`): attaches the JWT bearer token and the
  mandatory `x-device-type` header, and transparently refreshes the
  access token once on a 401 using the CSRF-protected refresh endpoint.
- Client-side auth guard (`useSession`) that loads `/system/me` and
  redirects unauthenticated visitors to the login page.

[Unreleased]: ../../compare/frontend-v1.5.0...HEAD
[1.5.0]: ../../compare/frontend-v1.4.0...frontend-v1.5.0
[1.4.0]: ../../compare/frontend-v1.3.0...frontend-v1.4.0
[1.3.0]: ../../compare/frontend-v1.2.0...frontend-v1.3.0
[1.2.0]: ../../compare/frontend-v1.1.0...frontend-v1.2.0
[1.1.0]: ../../compare/frontend-v1.0.0...frontend-v1.1.0
[1.0.0]: ../../releases/tag/frontend-v1.0.0
