# Frontend — System Console

[![Version](https://img.shields.io/badge/version-1.2.0-blue)](./CHANGELOG.md)

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

| Route | Purpose |
| --- | --- |
| `/system/login` | Sign in; redirects to `/system/dashboard` on success |
| `/system/register` | Create a system account |
| `/system/dashboard` | Stats overview |
| `/system/dashboard/users` | System Users — list, create, edit, delete |
| `/system/dashboard/tenant-users` | Tenant Users — list, create, edit, delete |
| `/system/dashboard/tenant-business` | Tenant Business — list, create, edit, delete, restore |
| `/system/dashboard/roles` | Roles — list, create, edit, delete, assign permissions |
| `/system/dashboard/permissions` | Permissions — list, create, edit, delete |

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
| `src/lib/api.ts` | Fetch wrapper: bearer token, `x-device-type` header, auto-refresh on 401 |
| `src/hooks/use-session.ts` | Auth guard + `hasPermission()` |
| `src/hooks/use-resource-list.ts` | Paginated/searchable list state for any endpoint |
| `src/components/resource-table.tsx` | Presentational table + pagination + toolbar/actions slots |
| `src/components/confirm-dialog.tsx` | Shared delete-confirmation modal |
| `src/components/sidebar-nav.tsx` | Permission-filtered nav |
| `src/components/theme-provider.tsx` / `theme-toggle.tsx` | Light/dark/system theming |

## Environment variables

See [`.env.example`](./.env.example). Only `NEXT_PUBLIC_API_URL` is required
— the base URL of the backend's versioned API.
