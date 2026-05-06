# T-07 — Effective project-role composition

**Status:** ready
**Depends on:** T-01, T-05, T-06
**Phase:** 6

## Goal

Implement `effectiveProjectRole = max(implicit-from-org, explicit-projectMember)` so org owners/admins automatically get baseline project access without explicit `projectMember` rows. Permission checks across `services/Projects.ts` and `services/Tickets.ts` consume effective role; UI shows implicit-via-org members distinctly.

## Scope

### Backend

- New helper `lib/effectiveRole.ts`:
  ```ts
  function effectiveProjectRole(
    orgRole: "owner" | "admin" | "member",
    projectRole: "owner" | "admin" | "member" | null
  ): "owner" | "admin" | "member" | null {
    if (orgRole === "owner") return "owner"
    if (orgRole === "admin") return rankMax("admin", projectRole)
    return projectRole
  }
  ```
  with `rankMax` honoring `owner > admin > member`.
- Update `Projects.requireMember(userId, orgId, projectId)`: composes `currentOrg.role` + `projectMember.role` → effective role. Returns NotFound if effective role is null (org member with no explicit project membership AND no implicit elevation).
- `Projects.requireRole(..., allowed)`: identical signature, just compares effective role against `allowed`.
- `Tickets`'s `ensureAccess` reuses `Projects.requireMember`.

### `loadMembers` semantics

- `Projects.loadMembers(projectId)` continues to return only **explicit** projectMember rows (this is the source of truth for "who has been deliberately granted access at the project level"). The "via org" rows are computed on the frontend by joining the org's `member` list to the project view, OR returned by a new endpoint `GET /orgs/:slug/projects/:slug/effective-members` if we want the server to compose it. **Recommend server-side composition** so the wire shape is honest.

### Frontend

- Project member list UI:
  - Explicit rows render normally (with role-edit affordances per existing rules).
  - Implicit rows render in a greyed style with the badge "Owner via org role" / "Admin via org role". No edit affordance — clicking offers "Manage in org settings" as a routable action.
  - Removing an implicit member from a project is not possible. The "Remove" button is hidden / disabled with explanatory tooltip.

### Constraint: org-membership precondition

- When adding someone to a project (`addMember`), require the target user to already be in `member` for this org. Otherwise return a typed error like `NotInOrganization` (or reuse `NotFound`). UI surface: invite to org first.
- Cascades: when an org member is removed, all their `projectMember` rows for that org are deleted (cascade via FK or explicit transactional delete in the org-removal path; pick whichever is cleaner with Better Auth's plugin).

## Out of scope

- Org settings UI for promoting users to org admin (T-10).
- Last-owner / transfer-ownership rules (T-10).

## Acceptance criteria

1. An org `owner` who has no `projectMember` row on a project can still read, edit, delete that project. Permission checks pass.
2. An org `admin` can edit project metadata + connect GitHub on any project, even with no `projectMember` row.
3. An org `admin` cannot delete a project they have no explicit `owner` projectMember on (admin doesn't elevate to project-owner).
4. An org `member` with no `projectMember` row on a project gets 404 on every project endpoint.
5. Member list UI shows "via org" rows distinctly. Tries to remove → routed to org settings.
6. Adding a non-org-member to a project fails with a typed error.

## Notes

- Server-side composition for the effective members endpoint keeps the wire shape simple: one array, with each member tagged `source: "explicit" | "org-role"`.
- The `effectiveProjectRole` function is small and pure — easy to unit-test exhaustively. Do that.
