# Frontend — System Console

[![Version](https://img.shields.io/badge/version-1.3.0-blue)](./CHANGELOG.md)

Next.js system administration console. See [`CHANGELOG.md`](./CHANGELOG.md)
for release history and [`../README.md`](../README.md) for the project overview.

| | |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19 |
| Styling | Tailwind CSS v4 + shadcn/ui (new-york style) |
| Theme | light / dark / system via `next-themes` |
| Motion | `motion` (Framer Motion); respects `prefers-reduced-motion` |
| Data | REST calls to the backend `/api/v1` |

## Setup

```bash
npm install
cp .env.example .env.local   # set NEXT_PUBLIC_API_URL if not localhost:4000
npm run dev                  # http://localhost:3000
```

Requires the backend to be running (see `../backend/README.md`).

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Production build |
| `npm run start` | Serve the production build |
| `npm run lint` | ESLint |

## Pages

### System dashboard (`/system/...`)

| Route | Purpose |
| --- | --- |
| `/system/login` | Sign in; redirects to `/system/dashboard` on success |
| `/system/register` | Create a system account |
| `/system/dashboard` | Stats overview |
| `/system/dashboard/users` | System Users — list, create, edit, delete |
| `/system/dashboard/tenant-users` | Tenant Users — list, create, edit, delete, view, "Login as" |
| `/system/dashboard/tenant-business` | Tenant Business — list, create, edit, delete, restore, view |
| `/system/dashboard/tenant-mapped-business` | Tenant Mapped Business — assign a business to a tenant user |
| `/system/dashboard/tenant-tax-types` | Tax Types — list, create, edit, delete, restore |
| `/system/dashboard/tenant-payment-modes` | Payment Modes — list, create, edit, delete, restore |
| `/system/dashboard/tenant-in-ex-categories` | Income & Expense Categories — list, create, edit, delete, restore |
| `/system/dashboard/tenant-business-branches` | Business Branches — list, create, edit, delete, restore |
| `/system/dashboard/tenant-network-providers` | Network Providers — list, create, edit, delete, restore |
| `/system/dashboard/tenant-mail-config` | Mail Config — list, create, edit, delete, send test email |
| `/system/dashboard/tenant-places` | Places — list, create, edit, delete, restore, map picker |
| `/system/dashboard/tenant-streets` | Streets — list, create, edit, delete, restore, map picker |
| `/system/dashboard/roles` | Roles — list, create, edit, delete, assign permissions (grouped, searchable) |
| `/system/dashboard/permissions` | Permissions — list, create, edit, delete |
| `/system/dashboard/settings/customization` | SaaS branding — app name, logo |

### Tenant portal (`/tenant/...`)

| Route | Purpose |
| --- | --- |
| `/tenant/login` | Tenant sign in; redirects to `/tenant/dashboard` |
| `/tenant/dashboard` | Tenant stats overview |
| `/tenant/users` | Team members mapped to the caller's business — list, create, edit, delete, view |
| `/tenant/settings/user-account` | Own profile — name, username, email, phone, password, avatar |
| `/tenant/settings/business-information` | Own business profile (view/update, per permission) |
| `/tenant/settings/business-branches`, `/network-providers`, `/tax-types`, `/payment-modes`, `/in-ex-categories`, `/mail-config`, `/places`, `/streets` | Self-service CRUD twins of the matching system-admin pages, scoped to the caller's own business |

## Permission-gated UI

`useSession()` loads `/system/me` and exposes `hasPermission(key)`. Every
create/edit/delete action and every sidebar nav item checks this before
rendering — a user without `roles:create`, for instance, never sees an
"Add Role" button, and `/system/dashboard/roles` disappears from the
sidebar entirely without `roles:read`. This mirrors, but does not replace,
the backend's own RBAC enforcement — the API is the actual authority.

System records (`isSystem: true`) lock their key fields in edit forms and
disable the delete action in the UI, matching backend behavior.

## Animation & responsiveness

- `motion` (Framer Motion, via `motion/react`) drives page-transition
  crossfades, a sliding active-indicator in the sidebar nav, staggered
  dashboard stat cards, animated resource-table rows, button press
  feedback, and entrance/error animations on the login/register cards.
  `MotionConfig reducedMotion="user"` in `src/app/layout.tsx` disables
  this automatically for users with the OS "reduce motion" setting on.
- `ResourceTable` renders as stacked cards below the `sm` breakpoint
  instead of a horizontally-scrolling table, so Users/Roles/Permissions
  stay usable on phones. Its loading state renders `Skeleton` rows/cards
  matching the real layout instead of a spinner.

## Key files

| File | Purpose |
| --- | --- |
| `src/lib/api.ts` | System API fetch wrapper: bearer token, `x-device-type` header, auto-refresh on 401 |
| `src/lib/tenant-api.ts` | Same, namespaced for the tenant portal (own token key, CSRF cookie, refresh path) |
| `src/hooks/use-session.tsx` | System auth Context provider: fetches `/system/me` once, exposes `hasPermission()` |
| `src/hooks/use-tenant-session.tsx` | Tenant equivalent, fetches `/tenant/me` once |
| `src/hooks/use-resource-list.ts` | Paginated/searchable list state for any endpoint; accepts an optional fetcher (`api` or `tenantApi`) and filters |
| `src/components/resource-table.tsx` | Presentational table + pagination + toolbar/actions slots |
| `src/components/row-actions-menu.tsx` | Collapses per-row actions into a single "..." dropdown |
| `src/components/confirm-dialog.tsx` | Shared delete-confirmation modal |
| `src/components/sidebar-nav.tsx` | Permission-filtered system dashboard nav |
| `src/components/tenant-shell.tsx` / `tenant-settings-nav.tsx` | Tenant portal shell and settings sub-nav |
| `src/components/ui/combobox.tsx` | Searchable Popover+Command select, used for business/tenant-user/role pickers |
| `src/components/location-picker-panel.tsx` / `location-picker/leaflet-map.tsx` | OpenStreetMap/Leaflet location picker (Places, Streets) |
| `src/components/theme-provider.tsx` / `theme-toggle.tsx` | Light/dark/system theming |

## Environment variables

See [`.env.example`](./.env.example). `NEXT_PUBLIC_API_URL` is required —
the base URL of the backend's versioned API. `NEXT_PUBLIC_OSM_TILE_URL` is
optional (defaults to the public OpenStreetMap tile server) and only used
by the Places/Streets location picker.
