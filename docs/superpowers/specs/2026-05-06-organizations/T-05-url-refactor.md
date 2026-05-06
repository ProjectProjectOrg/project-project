# T-05 — URL refactor to `/orgs/:orgSlug/projects/:projectSlug`

**Status:** ready
**Depends on:** T-01, T-02
**Phase:** 5

## Goal

Move every project-scoped URL to `/orgs/:orgSlug/projects/:projectSlug/...`. Backend handlers, atoms, route components, and links all updated. After this ticket, no project URL exists without an org segment.

## Scope

### Routes

- `routes/_authed.tsx` stays the auth-guard layout.
- New nested layout `routes/_authed.orgs.$orgSlug.tsx` — resolves the org membership for the current user and 404s on miss. Shells the org-scoped subtree.
- `routes/_authed.orgs.$orgSlug.projects.index.tsx` — project list for the org.
- `routes/_authed.orgs.$orgSlug.projects.$projectSlug.tsx` — project detail.
- `routes/_authed.orgs.$orgSlug.projects.$projectSlug.tickets.$id.tsx` — ticket detail.
- (Plus docs routes if they exist post-Phase 7 of the main spec.)

### Backend

Update the HttpApi groups in `packages/shared/src/api.ts`:

- `Projects` group endpoints become path-parametrized on `:orgSlug`:
  - `GET /orgs/:orgSlug/projects` → list
  - `POST /orgs/:orgSlug/projects` → create
  - `GET /orgs/:orgSlug/projects/:slug` → detail
  - … etc.
- Same for `Tickets` group.
- Handlers thread `orgSlug` from `path` through to services. Services take an `orgId` (resolved by the middleware in T-06).

### Frontend

- `atoms/projects.ts` family keys become `(orgSlug, projectSlug)` rather than `slug`.
- `atoms/tickets.ts` same.
- All `Link`s and `useNavigate` calls updated. `useParams()` reads both `orgSlug` and `projectSlug` from the route.
- `runtime.ts` ApiClient keys unchanged; the path params are just additional inputs.

### Permission gate

`Projects.requireMember(userId, projectId)` becomes `Projects.requireMember(userId, orgId, projectSlug)` — resolves the project by `(orgId, slug)` and the membership by `(userId, projectId)`. NotFound on any miss (no info leak).

## Out of scope

- Effective-role composition (T-07).
- Active-org session sync (T-06).
- Org switcher (T-08).

## Acceptance criteria

1. `bun run typecheck` passes across all packages.
2. Existing functionality (list projects, view project, create ticket, edit ticket, etc.) all work under the new URLs.
3. Visiting `/orgs/<not-a-real-slug>/...` → 404.
4. Visiting `/orgs/<real-slug-user-isnt-in>/...` → 404 (not 403; no info leak).
5. All project-scoped UI links use the new URL pattern; no `/projects/...` URLs remain.

## Notes

- This is the largest single PR in the rollout. Consider feature-flagging the route tree if mid-PR review takes too long.
- The `routes/_authed.orgs.$orgSlug.tsx` layout is the natural place to call `auth.client.organization.setActive` when the user navigates into an org context — that's the URL→session sync. (The actual implementation of the helper is T-06.)
