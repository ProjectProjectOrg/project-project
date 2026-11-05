# T-06 — `currentOrg` resolver + active-org session sync

**Status:** ready
**Depends on:** T-05
**Phase:** 5

## Goal

Centralize how the backend resolves "which org is this request acting in?" and how the session's `activeOrganizationId` is kept in sync with the URL. Single seam for future subdomain support.

## Scope

### Backend

- New helper service `services/CurrentOrg.ts`:
  - `currentOrg.fromRequest(request): Effect<{ organizationId, orgSlug, role }, NotFound | Unauthorized>` — reads `:orgSlug` from path params (later: from `Host` header), looks up `(orgSlug, currentUser.id)` in `member`, fails with `NotFound` on miss.
  - `currentOrg.requireRole(allowed: OrgRole[]): Effect<...>` — for org-level gates.
- `Auth` middleware composes `currentUser` + `currentOrg` so handlers can yield both. Keep `currentUser` available standalone for routes outside `/orgs/:orgSlug` (e.g. `/onboarding`).
- Every project / ticket handler that previously took `userId` now takes `userId + organizationId` and passes them through to the service layer.

### Active-org session sync

- On every request entering the `/orgs/:orgSlug/*` subtree, check if `session.activeOrganizationId` matches the URL's org. If not, call `auth.api.setActiveOrganization` to sync.
- This sync is **side-effectful**: it updates the cookie. It must be debounced or no-op-on-match to avoid hammering Better Auth on every request.

### Frontend

- Wherever the frontend reads "current org" outside route params (e.g. for the org switcher dropdown), use a small atom that derives from the URL (`useParams().orgSlug`) — not from the session. URL is canonical (per Q9).

## Out of scope

- The `/_admin` panel's own org context (it doesn't have one — it's instance-scoped).
- Subdomain extraction. This ticket builds the seam; the swap happens in v2.

## Acceptance criteria

1. Project handlers no longer manually re-resolve org → all of them yield `currentOrg` and use the resolved `organizationId`.
2. A request to `/api/orgs/<not-a-real-slug>/projects` returns 404, not 500 or unauthorized leak.
3. After visiting `/orgs/foo`, the session's `activeOrganizationId` matches `foo`'s id (verifiable in DB).
4. Switching between two orgs via direct URL navigation (no UI switcher needed yet) updates `activeOrganizationId`.
5. Helper `services/CurrentOrg.ts` is the only place `member` table is queried for "which org is the user acting in" — no other handler does it inline.

## Notes

- Keep the resolver a `Context.Tag` Effect service so it composes cleanly in the request handler graph.
- The "Host header" future swap is roughly: `currentOrg.fromRequest` switches from `path.orgSlug` to `extractSubdomain(request.headers.host)`. Single function change.
