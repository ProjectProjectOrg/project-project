# T-07 — Effective project-role composition

**Status:** CLOSED. Behavior is already implemented; ticket is no longer needed.

## What was originally proposed

`effectiveProjectRole(orgRole, projectRole) → role | null`, where org owner implied project owner everywhere and org admin implied project admin everywhere. UI rendered "via org role" badges next to implicit members. The composition rule was design decision #3 in the original grilling.

## Why it's closed

After building T-01..T-06 and seeing the downstream complexity (member list UI distinguishing implicit/explicit rows, "remove from project" routing to "leave org instead", separate `loadMembers` vs effective-members endpoints, the `effectiveProjectRole` helper itself), we revisited decision #3 and switched to **strictly orthogonal roles**:

- Org-level role grants org-level capabilities (settings, billing, invites). Zero project-content access.
- Project-level role grants project-level capabilities. Requires an explicit `projectMember` row.
- Even the org owner doesn't auto-get access to a project — they must be added explicitly.

The full rationale is in `design.md` under "Decisions", item 3.

## Why no implementation work is needed

The existing `Projects.requireMember` and `Projects.requireRole` already check `projectMember.role` only — no org-role composition. The `_orgSlug` parameter that's threaded through is unused (preserved as a leftover from when we expected to compose). The strict-orthogonal stance is already the runtime behavior; T-07 was always going to be paperwork.

## Where the spilled-over scope lives

- **Org-membership precondition on `addMember`** (target user must be in the org before being added to a project) — small (~5-line) defensive check; lands in whichever PR next touches `Projects.addMember`. Not a separate ticket.
- **Cascade on org-removal** (drop `projectMember` rows for projects in that org when a user is removed from / leaves the org) → T-10 (org settings).
- **Lockout recovery** (org owner force-adding themselves to any project in their org) → T-10.

## Removed UI complexity (vs. the original plan)

- No "via org role" greyed rows in the project member list.
- No "you can't remove this person from the project" indirection.
- No separate effective-members endpoint.
- No `effectiveProjectRole` helper.

Member list is just `projectMember` rows. Permissions are just the `projectMember.role` value.
