# Changelog

All notable changes to the frontend are documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: ../../compare/frontend-v1.1.0...HEAD
[1.1.0]: ../../compare/frontend-v1.0.0...frontend-v1.1.0
[1.0.0]: ../../releases/tag/frontend-v1.0.0
