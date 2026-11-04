# T-11 — Super-admin panel `/_admin`

**Status:** ready
**Depends on:** T-01, T-10
**Phase:** 10

## Goal

Instance-level super-admin (Better Auth's `admin` plugin role) gets a panel at `/_admin` to list all orgs and users, suspend/restore orgs, soft- and hard-delete orgs, create orgs (alternative path to self-serve), and impersonate users for support.

## Scope

### Routes

- `/_admin` — root, redirects to `/_admin/orgs`.
- `/_admin/orgs` — list all orgs. Columns: name, slug, owner, member count, project count, createdAt, status (active / soft-deleted / hard-delete-pending).
- `/_admin/orgs/new` — create org. Form: name, slug, initial owner (existing user picker or invite-by-email).
- `/_admin/orgs/:slug` — detail view. Members, projects, lifecycle actions.
- `/_admin/users` — list all users. Columns: email, username, role, banned status, createdAt.
- `/_admin/users/:id` — detail. Ban/unban affordances. "Impersonate" button.

### Permission gate

- Single check on `/_admin/*`: `currentUser.role === "admin"` (Better Auth's instance-level admin role). Otherwise 404 (don't leak existence).
- Super-admin can read everything but doesn't get implicit project content access — they impersonate to debug content. Org metadata + member lists are admin-readable; project files are not (must impersonate to read).

### Impersonation

- `POST /_admin/users/:id/impersonate` — calls `auth.api.impersonate`. Switches the session. Redirects to `/`.
- A persistent banner on every page during impersonation: "Impersonating <name>. [Stop]". Stop button calls `auth.api.stopImpersonating`, returns to the admin user's session.
- Impersonation event logged (console for v1; structured log later).

### Backend

- HttpApi endpoints:
  - `GET /_admin/orgs`, `GET /_admin/orgs/:slug` — list / detail.
  - `POST /_admin/orgs` — create org.
  - `POST /_admin/orgs/:slug/restore` — clear `deletedAt` (already added in T-10's backend, just exposed here).
  - `POST /_admin/orgs/:slug/hard-delete` — bypass grace period. Cascade.
  - `GET /_admin/users`, `GET /_admin/users/:id` — list / detail.
  - `POST /_admin/users/:id/impersonate`, `POST /_admin/users/:id/ban`, `POST /_admin/users/:id/unban` — wraps Better Auth admin plugin methods.

### UI

- Visually distinct from the main app — different accent color or top-bar treatment so it's obvious you're in admin mode.
- Tables use TanStack Table (already in the stack).

## Out of scope

- Detailed audit log UI.
- Org-level usage metrics / dashboards.
- Multi-step approval workflows.
- Granular admin permissions (read-only admin vs full admin) — single super-admin tier in v1.

## Acceptance criteria

1. Non-admin visits `/_admin` → 404.
2. Admin visits `/_admin` → redirects to `/_admin/orgs`, sees all orgs.
3. Admin creates an org via `/_admin/orgs/new` with an existing user as owner. The user can sign in and see it.
4. Admin creates an org with an email-invite owner. The invitee receives an invite (logged or sent).
5. Admin restores a soft-deleted org. Org state returns to active.
6. Admin hard-deletes an org. DB cascades; FS dir removed.
7. Admin impersonates a user → sees the app as them. Banner shows impersonation. Stop returns to admin session.
8. Admin bans a user → that user's sessions invalidated; sign-in fails until unbanned.

## Notes

- Better Auth's admin plugin handles the impersonation cookie / session swap automatically. We just call the API.
- The instance-level `admin` role is set on the `user` table by the migration script (T-03) for the bootstrap user. Subsequent admin promotions go through `auth.api.setRole` from another admin (or direct DB edit for emergency).
