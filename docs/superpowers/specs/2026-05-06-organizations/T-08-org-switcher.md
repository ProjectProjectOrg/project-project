# T-08 — Org switcher in navigation

**Status:** ready
**Depends on:** T-04, T-05
**Phase:** 7

## Goal

Users in 2+ orgs get a switcher in the top nav. Clicking an org navigates to `/orgs/:newSlug` (which triggers active-org session sync per T-06). Users in 1 org see no switcher.

## Scope

- New component `components/OrgSwitcher.tsx`:
  - Reads the user's orgs via a new atom `userOrgsAtom` calling `auth.client.organization.list()` (or a thin HttpApi wrapper).
  - Renders nothing if the list has length ≤ 1.
  - Otherwise: dropdown trigger showing current org's name, popover with full list, "+ Create new org" footer item.
- Mount in the top nav (`components/Nav.tsx` or wherever the existing nav lives).
- "Create new org" menu item routes to `/onboarding` (reusing T-04).
- Keyboard navigation: arrow keys, Enter to select. Focus returns to trigger on close.

## Out of scope

- Inline org search (defer until a user is in 10+ orgs and the dropdown gets unwieldy).
- "Recently visited" sorting — alphabetical for v1.
- Pinned / favorited orgs.

## Acceptance criteria

1. User with one org: no switcher visible.
2. User with two+ orgs: switcher visible, current org highlighted in the popover.
3. Clicking another org navigates to `/orgs/:newSlug`. URL updates; activeOrgId session value syncs (verifiable in DB / cookie).
4. "+ Create new org" item navigates to `/onboarding`; user can create a new org and lands in it.
5. Keyboard nav works; popover closes on Escape and on outside click.
6. Press feel + hover feel match the project's standards (see CLAUDE.md): `transition-colors`, `hover:bg-accent`, `active:scale-[0.97]`.

## Notes

- Use shadcn's `DropdownMenu` or BaseUI's `Popover` — whatever's already used in the codebase. Don't reach for new primitives.
- The current org's `slug` is derivable from `useParams().orgSlug` — no need to query the session.
