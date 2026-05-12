# Sprints — design spec

Date: 2026-05-08
Branch: `feat/T-8-sprints`

## Goal

Add a Sprints UI on top of the existing `Group` (kind=`sprint`) backend, without compromising the simplicity of the current ticket list. Specifically: planning future sprints, attaching tickets to sprints, and showing the active sprint must each have an answer that fits the project's "density without noise" principle.

## Decisions

| Topic                  | Decision                                                                                                                                                                               |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing `Tickets` tab | Rename to **Backlog**                                                                                                                                                                  |
| Sprints surface        | Sibling project tab next to Backlog                                                                                                                                                    |
| Sprint cadence         | Freeform manual sprints — no enforced rhythm; gaps and overlapping date ranges are allowed                                                                                             |
| Membership rule        | A ticket can belong to **at most one** active-or-planned sprint at a time. Once a sprint completes, its ticket list freezes (history) and members are free to be added to a new sprint |
| Sprints page layout    | Master/detail — rail of all sprints, detail pane shows the selected sprint                                                                                                             |
| Where the rail lives   | Inside the **app sidebar**. Entering `/sprints` triggers a push-nav animation (default sidebar slides left + fades, sprint rail slides in from the right). Exiting reverses it         |
| Backlog row affordance | Sprint chip visible only when the ticket _is_ in a sprint. Empty rows reveal a faint `+ assign sprint` only on hover                                                                   |
| Active-sprint ambient  | Replace the `/slug` line under the project name with `Sprint X · N days left` (clickable → jumps to that sprint). When no sprint is active, fall back to `/slug`                       |
| Sprint completion flow | Inline form modeled on `CreateBranchFields` — bulk choice "carry remaining → next planned sprint / Backlog", default = next planned sprint if any, else Backlog                        |
| Sidebar slot mechanism | React-context-based slot (`SidebarSlotProvider` + `useSidebarSlot`). Animation is `AnimatePresence` keyed on slot presence                                                             |

## Routes

```
/orgs/$orgSlug/projects/$slug                    Backlog (was Tickets)
/orgs/$orgSlug/projects/$slug/sprints            Sprints page, no selection
/orgs/$orgSlug/projects/$slug/sprints/$groupId   Sprints page, selected sprint
/orgs/$orgSlug/projects/$slug/about
/orgs/$orgSlug/projects/$slug/members
```

`TabsNav` adds a `sprints` tab between Backlog and About, with a count badge for _active + planned_ (completed don't count).

## Sidebar slot + drill-down animation

`Shell` in `_authed/route.tsx` wraps its `<aside>` content in a `SidebarSlotHost`. The host renders either the default sidebar (`Logo`, `Wordmark`, nav items, `ThemeSwitcher`) or, when the slot is filled, the pushed content. The transition uses `AnimatePresence` with `mode="popLayout"`:

- Default → pushed: default exits with `x: -16, opacity: 0`, pushed enters from `x: 16, opacity: 0` to `x: 0, opacity: 1`.
- Reverse: same in reverse.
- Spring: reuse `springs.moderate` from `@/lib/springs` for consistency with `SegmentedTabs`.

`SprintsPage` (the `/sprints` route component) calls `useSidebarSlot(<SprintRail … />)` in an effect, returning a cleanup that empties the slot. The rail is rendered via portal/slot, not as a child of the page — so `/sprints` ↔ `/sprints/$groupId` does **not** unmount/remount the rail; only the detail pane changes.

The rail's own header has a back affordance (chevron + project name) that navigates to `/orgs/$orgSlug/projects/$slug` (the Backlog), which by virtue of leaving `/sprints` empties the slot and triggers the reverse animation.

## Component tree

New under `packages/frontend/src/components/sprints/`:

- `SprintsPageLayout.tsx` — component for the `/sprints` parent route. Mounts the rail into the sidebar slot via `useSidebarSlot`, then renders `<Outlet />`. The outlet hosts either `SprintsIndex` (no selection) or `SprintDetail` (selection) depending on the matched child route.
- `SprintsIndex.tsx` — `/sprints` index route. Renders `SprintEmptyState` ("No sprint selected").
- `SprintDetail.tsx` — `/sprints/$groupId` child route component (described below).
- `SprintRail.tsx` — sidebar content. Header with back affordance + "New sprint" trigger. Sections: Active / Planned / Completed. Each row navigates to `/sprints/$groupId`. The "New sprint" trigger expands inline (matching `InlineForm` pattern) into a name + date-range form.
- `SprintRailRow.tsx` — single row: status dot (active=foreground, planned=muted-foreground/40, completed=muted-foreground), name, date range (mono), ticket count.
- `SprintDetail.tsx` — `SprintDetailHeader` + `SprintTicketList` + "Add tickets" trigger + completion CTA (active sprints only).
- `SprintDetailHeader.tsx` — inline-editable name (matches `NameField` in project route), inline-editable date range, kebab menu (rename, delete, complete-now).
- `SprintTicketList.tsx` — projects the sprint's `tickets[]` against the project's cached ticket list and renders the existing `TicketList` rows. Adds a row-level "Remove from sprint" action behind the existing per-row menu.
- `SprintAddTicketsPicker.tsx` — `Command`-palette-style searchable list scoped to the project's tickets, multi-select, excludes tickets already in a _completed_ sprint visibly less prominent (still selectable — moving from completed-history to a new sprint is fine because completion freezes the source group's record).
- `SprintEmptyState.tsx` — two flavors: "No sprints yet" (with a dithered Geist-Pixel mark and a "New sprint" CTA), and "No sprint selected" (quieter, just a hint to pick from the rail).
- `CompleteSprintForm.tsx` — `InlineForm` with bulk carry-over destination as a `SegmentedTabs` (variant=`inline`) — items are `[NextPlannedSprintName | Backlog]`. Submit calls `completeSprintAtom`.

Touched (additive, small):

- `routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx`
  - `TabsNav`: add `sprints` tab def with badge for active+planned count.
  - `ProjectHeader`: replace the `/slug` `<p>` with an `ActiveSprintLine` component that subscribes to `sprintsListOptimisticAtom` and either renders a clickable `Sprint X · Nd left` line, or falls back to `/slug`.
- `routes/_authed/orgs/$orgSlug/projects/$slug/sprints/route.tsx` — parent file route, component = `SprintsPageLayout`.
- `routes/_authed/orgs/$orgSlug/projects/$slug/sprints/index.tsx` — index route, component = `SprintsIndex`.
- `routes/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId.tsx` — child file route, component = `SprintDetail`.
- `routes/_authed/route.tsx` — wrap `Shell` aside in `SidebarSlotHost`. Add `SidebarSlotProvider` at the authed-layout level so it survives across routes.
- `components/SidebarSlot.tsx` — new: `SidebarSlotProvider`, `SidebarSlotHost`, `useSidebarSlot(node)` hook. Internal state is a single React node; `useSidebarSlot` sets it on mount, clears on unmount. Host renders the slot content via `AnimatePresence`.
- `components/TicketList/index.tsx` — accept optional `sprintMembership: ReadonlyMap<TicketId, Group>`. When present, each row renders `<SprintField>` in the meta cluster.
- `components/TicketList/SprintField.tsx` — new: when membership present → always-visible `SprintChip`; when absent → opacity-0 `+ assign sprint` chip that becomes visible on row hover (parent `:hover` selector). Click opens a popover listing active + planned sprints with a "New sprint…" tail row.

## Atoms

New `packages/frontend/src/atoms/sprints.ts`:

```ts
sprintsListAtom(projectKey) // base, family-keyed, idle TTL
sprintsListOptimisticAtom(projectKey) // public — Atom.optimistic(sprintsListAtom)
sprintAtom(projectKey, groupId) // base, family-keyed, body + tickets
sprintOptimisticAtom(projectKey, groupId) // public

createSprintAtom(projectKey) // optimisticFn against sprintsListAtom
updateSprintAtom(projectKey) // optimisticFn — name/dates/body
addTicketsToSprintAtom(projectKey) // optimisticFn — moves ids between groups
removeTicketsFromSprintAtom(projectKey) // optimisticFn
completeSprintAtom(projectKey) // optimisticFn — sets completedAt, applies carryover
deleteSprintAtom(projectKey) // optimisticFn

sprintMembershipAtom(projectKey) // derived — Map<TicketId, Group> over non-completed sprints from sprintsListOptimisticAtom
```

All mutation atoms refresh the **base** atoms after `fn` resolves — never the optimistic wrappers — per CLAUDE.md mutation pattern.

### Reducer behaviors

- `createSprintAtom.reducer` prepends a synthetic `Group` with a placeholder id `G-pending-<nonce>`; the real id arrives on refresh.
- `updateSprintAtom.reducer` mutates the matching group in the list (and the single sprint atom if subscribed).
- `addTicketsToSprintAtom.reducer` appends ids to the target group's `tickets`, removes those ids from any _other_ non-completed group in the same list (mirrors the C-rule).
- `removeTicketsFromSprintAtom.reducer` drops ids from the target group.
- `completeSprintAtom.reducer` marks `completedAt: now()` on the source. If carryover destination is a sprint id, moves remaining (status ≠ done) ticket ids from source to destination. If "backlog", just drops them from source.
- `deleteSprintAtom.reducer` removes the group from the list.

### Affected refreshes

| Mutation      | Refresh                                                                                              |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| create        | `sprintsListAtom`                                                                                    |
| update        | `sprintsListAtom`, `sprintAtom(groupId)`                                                             |
| addTickets    | `sprintsListAtom`, every affected `sprintAtom` (target + source-of-moves)                            |
| removeTickets | `sprintsListAtom`, `sprintAtom(groupId)`                                                             |
| complete      | `sprintsListAtom`, source `sprintAtom`, destination `sprintAtom` (if any), project `ticketsListAtom` |
| delete        | `sprintsListAtom`                                                                                    |

## Backend dependency (the C-rule)

The current `groups.addTickets` handler accepts ticket ids regardless of existing membership. To enforce the C-rule (one active-or-planned sprint per ticket) without forcing the client to do two round-trips per move, the handler should **auto-remove** the moved ticket ids from any other non-completed group in the same project, atomically, and return both the updated target and a list of source groups it touched.

Recommended shape (reuses existing types):

```
addTickets(groupId, ticketIds) → { target: Group, evicted: Array<{ groupId, ticketIds }> }
```

The frontend's `addTicketsToSprintAtom.fn` reads `evicted` from the response and refreshes those source `sprintAtom`s in addition to the target. The reducer mirrors this in the optimistic mirror.

If we choose instead to make the handler **reject** conflicting ids, the frontend must do an extra `removeTickets` call before the add — adds a round-trip, breaks atomicity, and risks half-applied state. Auto-remove is the cleaner contract.

This is the only backend change required by this spec. Filed as a sub-task of T-8.

## i18n

New translations land in `packages/frontend/messages/en/`. Allocation per existing rules:

- `tickets.json` — backlog row affordances on the ticket list (`tickets_assign_sprint`, `tickets_sprint_field_label`, popover titles).
- A new file `packages/frontend/messages/en/sprints.json` — prefix `sprints_`. Update Inlang `pathPattern` and the prefix table in `CLAUDE.md` in the same PR.

Initial keys in `sprints.json`:

```
sprints_active_label, sprints_planned_label, sprints_completed_label,
sprints_new_button, sprints_new_name_placeholder, sprints_date_range_label,
sprints_count_pluralized, sprints_active_with_days_left,
sprints_complete_button, sprints_complete_carry_to_next, sprints_complete_carry_to_backlog,
sprints_complete_in_progress, sprints_delete_confirm_prompt, sprints_delete_button,
sprints_add_tickets_button, sprints_add_tickets_placeholder,
sprints_remove_from_sprint_action,
sprints_empty_no_sprints_title, sprints_empty_no_sprints_body,
sprints_empty_no_selection_title, sprints_empty_no_selection_body,
sprints_back_to_project_aria,
error_sprint_not_found, error_sprint_completed_immutable
```

`tickets.json` additions: `tickets_assign_sprint_chip`, `tickets_sprint_popover_title`, `tickets_sprint_popover_new_sprint_action`.

Project-header active line goes in `projects.json` (prefix `project_`): `project_header_active_sprint_summary`.

## Visual + interaction details

- Sprint status dot in the rail: 6px, color tokens — Active = `--foreground`, Planned = `--muted-foreground/40`, Completed = `--muted-foreground`. No chromatic hue (per design context — chrome stays neutral).
- Date range in the rail uses `font-mono` `text-[11px] text-muted-foreground` — same density vocabulary as the ticket-id slug elsewhere.
- "New sprint" form expands inline at the top of the Active section in the rail (so the new sprint appears where it'll live once dated). Initial dates default to "today + 14 days" but are clearable.
- `SprintField` popover content layout: top section "Active + Planned" sprints (clickable rows with the same status dot + name + date), bottom row "New sprint…" that opens the rail's create flow.
- `CompleteSprintForm` echoes `CreateBranchFields` shape: primary action (`Complete sprint`), secondary inline pill row (`Carry remaining to: [Next sprint pill | Backlog pill]`), cancel + submit. Press feel + hover asymmetry per CLAUDE.md.
- Empty-state graphics use the dither vocabulary (`#FEFEFE` + `#807F7F` greys on the surface). One graphic for "No sprints yet" — a stepped/dithered calendar mark — and one for "No sprint selected" — quieter, just text plus a small dithered chevron pointing left at the rail.

## Testing

Atoms — unit tests against `sprints.test.ts`:

- `addTicketsToSprintAtom` reducer evicts the moved ids from any other non-completed group, leaves completed groups untouched.
- `completeSprintAtom` with destination = sprint id moves status≠done tickets, leaves status=done in the closed sprint's record.
- `completeSprintAtom` with destination = backlog drops remaining tickets.
- Optimistic state matches server state after refresh (smoke).

Components — Playwright/RTL flows:

- Drill-down animation: entering `/sprints` triggers slot fill, exiting empties it; the rail does not remount across `/sprints/$groupId` changes.
- `SprintField` hover affordance: chip is opacity-0 by default on tickets without a sprint, becomes visible on row hover.
- Active-sprint summary line clicks through to the active sprint.
- Complete-sprint flow: opens inline form, picks "Backlog", confirms; remaining tickets are no longer in the sprint after refresh; sprint moves to Completed section.

## Out of scope

- Sprint capacity / story-point planning UI.
- Cross-project sprints.
- Sprint reports (velocity, burndown).
- Drag-and-drop ticket reordering inside a sprint, or drag-between-sprints.
- Auto-rolling cadence (the cadence question was answered as "freeform manual"; auto-roll can be a follow-up if it ever becomes wanted).
- Locale switcher addition for sprint strings — covered by the existing future-locale rollout.
