# Kanban view — implementation plan

Working notes for the kanban view on the sprint detail page. Throwaway doc; delete when the work merges into `main`.

**Branch:** `feat/T-7-kanban-view`

## Status (as of writing)

- [x] Spike completed. Pragmatic DnD chosen over dnd-kit at 200+ cards. Spike still lives at `routes/(public)/spike/` — delete in final cleanup commit.
- [x] **Step 1.** Shared schema + backend endpoint + handler + 6 tests. `updateTicketOrder` on Groups.
- [x] **Step 2.** Frontend atoms: `placeTicketAtom` (optimisticFn) + `pendingTicketStatusAtom` (overlay).
- [x] **Step 3.** `PageContainer` restructure — moved out of project route's Outlet wrapper, each tab opts in.
- [x] **Step 4.** Sprint detail view-tab plumbing: `?view=` search param, `SegmentedTabs` in header (default variant + Rows3/Columns3 icons, plain `<button>{content}</button>` renderItem — internal motion indicator), creator lifted to `SprintDetail` above the header, board view full-bleed escaping `PageContainer`, `SprintBoard` stub with measured height (`useLayoutEffect` + `ResizeObserver`, `window.innerHeight - rect.top - 56` with 240px floor).
- [x] **Step 5.** `SprintBoardCard` — vertical card. Reuses `TypeButton` (new `iconOnly` variant), `PriorityButton`, `AssigneeRowTrigger`, `TicketGitChip`. 2-line title clamp, mono ID, press scale, navigates on click via `?ticket=` search param.
- [x] **Step 6.** `SprintBoardColumn` + `SprintBoard` real — spike logic ported. Card slots wrap `SprintBoardCard` with `draggable` + drop target; per-card edge math; auto-animate on column list; tail drop zone; outer column container is not a drop target (scrollbar strip rejects).
- [x] **Step 7.** `placeTicketAtom` wired in `monitorForElements`. Neighbor lookup from edge: bottom → `after = dst.id`; top → previous card in same column or `null`. Column tail → `after = last in column` or `null`. Status only sent when it changed. Grouping reads overlay via `effectiveStatus`.
- [x] **Step 8.** Card click → `navigate({ to: ".", search: prev => ({ ...prev, ticket: id }) })` (pushed). Done as part of step 5.
- [x] **Step 9.** Polish: per-card `motion.div` boxShadow drop-flash keyed by `useFlashOnLand`-style ref+tick; `animate-pulse` on cards whose ticket id is in `pendingTicketStatusAtom`; completed-sprint board carries `opacity-90` and slots get no `draggable`/drop targets.
- [x] **Step 10.** Spike cleanup. Deleted `packages/frontend/src/routes/(public)/spike/` once the live board was verified end-to-end.

---

## Part 1 — Grilling transcript

Q&A format, with reasoning preserved. Each question was asked one at a time, with a recommendation, then the user picked.

### Q1 — Where does intra-column ordering live?

**Options:**
- A. Use sprint's existing `Group.tickets[]` array order. Filter by status preserves array order. Reorder via existing array operations. No schema change.
- B. Add per-ticket `position` field. Independent of sprint membership.
- C. Per-sprint join table with its own position. `sprint_ticket(sprint_id, ticket_id, position)`. Survives sprint rejoin.

**Reasoning:** Sprint's `tickets[]` is already a meaningful order — `addTicketsToSprintAtom` preserves it through merges. Kanban becomes a view transformation over existing data. B and C add concepts the data model doesn't need yet.

**Locked: A.**

### Q2 — How do we persist a cross-column drag?

A cross-column drag changes both status (ticket property) and order (sprint's `tickets[]`).

**Options:**
- A. Two sequential mutations (`updateTicketAtom` for status, then `updateTickets` for order). Both optimistic. Risk: status update succeeds but order doesn't, leaving partial state.
- B. Extend/add an endpoint that takes both atomically.
- C. Two parallel mutations.

**Reasoning:** A's failure case (right column, wrong position) is the worst kind of half-success for a board. B is one round trip, atomic on the server, single optimistic reducer.

**Locked: B.**

### Q3 — API shape for the atomic endpoint

**Options:**
- A. Extend `updateTickets` payload from `Array<TicketId>` to `Array<{ id, status? }>`. Whole-list replace, status changes ride along. 4 callsites to mechanically reshape.
- B. New `boardMove` endpoint taking per-operation payload.
- C. Keep `updateTickets` as-is, add `updateTicketsWithStatus` sibling.

**User course-correction:** "B, but don't call it boardMove, it should be something more generic like 'updateTicketOrder', I want to be able to pass in a single ticket with an order and have it work, we shouldn't have to pass in more than that, the server should easily be able to figure out the rest."

### Q3a — What does "an order" mean on the wire?

- A. Absolute index into sprint's `tickets[]` (0-based).
- B. Status-scoped index (position within column).

**Reasoning given to user:** Both have a subtle off-by-one problem because removing the source shifts indices. Walked through an example with sprint `[T-1, T-2, T-3, T-4, T-5]` and showed that "drag T-1 below T-2 with index=2" naively gives wrong result.

Two flavors of "absolute index":
- A1. Index in post-remove array. Client simulates the splice.
- A2. Neighbor reference: `after: TicketId | null`. No arithmetic.

**User course-correction:** "this feels like overcomplicating. What would, in your opinion, taking a step back, be the right api shape for this update call?"

**My revised answer (committed):** Neighbor-reference is the simplest correct shape. Index-based feels simpler but isn't, because the array shifts under you under concurrent edits. Notion / Linear / Figma all express ordering as neighbor refs.

**Locked shape:**

```http
PATCH /orgs/:orgSlug/projects/:slug/groups/:id/ticket-order

payload: {
  ticketId: TicketId
  status?: TicketStatus    // omit if status didn't change
  after: TicketId | null   // null = first in tickets[]
}

response: GroupDetail
```

Server logic: pull `ticketId` out of `tickets[]` → if `status` set, patch the ticket's status → splice `ticketId` immediately after `after` (or at index 0 if null).

### Q4 — View toggle placement

- A. Toggle inside `SprintDetailHeader`, body swaps between list and board. URL search param `?view=board`.
- B. Two separate routes (`/sprints/$groupId` and `/sprints/$groupId/board`).
- C. Toggle in project-level toolbar.

**Reasoning:** A matches the earlier URL-search-param decision, keeps route shape unchanged, puts toggle next to sprint title where the eye lands. B fragments the sprint detail file. C is wrong-scope (board is per-sprint).

Also decided: board view inherits **none** of list view's toolbar (filters, sort, search) for v1. Cleanest, ships fastest.

User noted concern about visual stacking of nav tabs above view tabs — flagged as a polish concern, "we'll get there when we get there."

**Locked: A + v1 = no toolbar inheritance.**

### Q5 — Board frame: width and height

- A. Viewport-derived fixed height: `h-[calc(100svh-Xrem)]`. Magic number, slightly fragile.
- B. Flex chain from root: `flex-1 min-h-0` propagated. Cleaner but requires structural change to `PageContainer` everywhere.

**User course-correction:** "100% A, but I also want to make it fit to the entire width, wider than the container that the header and such are contained to, just the board though. And it should be able to scroll horizontally when there's enough statuses to switch between."

**Clarified:** "full width of `<main>`" — fill the rounded muted page surface edge-to-edge.

### Q5a — How does the board escape `PageContainer`?

- A. Restructure: move `PageContainer` out of `ProjectLayout`'s Outlet wrapper. Each tab decides its own wrapping. ~4 tab roots touched, mechanical.
- B. Local escape via negative margins. CSS-hairy, depends on knowing sidebar/scrollbar widths, fragile.

**Locked: A.**

### Q6 — Optimism across two atoms (cross-cutting: order lives on sprint, status lives on ticket)

- A. Non-optimistic v1. Match `updateTicketAtom`'s existing pattern.
- B. Optimistic over `sprintsListAtom` only. Card appears at new position but old column during round trip — visually broken.
- C. Optimistic over `sprintsListAtom` + "pending status patches" overlay atom. Board grouping reads status as `overlay.get(t.id) ?? t.status`.
- D. Make `updateTicketAtom` optimistic too, use two mutations. Undoes Q2.

**Reasoning:** B is broken by design. A is cheap but kanban is exactly the surface CLAUDE.md says needs optimistic flips. D undoes Q2. C is moderate complexity: one new overlay atom family + merge expression at the board grouping site.

**Locked: C.**

### Q7 — Board card content & component relationship

**Component:**
- A. New `SprintBoardCard` component, reuses field sub-components (TagChip, MemberAvatar, GithubChip, type/priority icons).
- B. Extend `TicketList`'s row with a `variant="card"`.

**Reasoning:** Different shape (vertical card vs horizontal row) = different component. Sub-component reuse is the right reuse layer.

**Content:**
- A1. Minimal — line 1: type icon + title (2-line clamp). Line 2: priority dot + ID + git chip + assignee. Tags hidden.
- A2. Plus always-visible tags. Bloats card height unevenly.
- A3. Match list row exactly. Defeats the point.

**User course-correction:** "A for sure, A1 sounds right, but we have icons for the priority, and I want the same dropdown inline edit functionality on the type, priority and assignees. The rest can be configured on click where it can navigate to the board view with that ticket expanded, making sure a 'back' press on the browser brings the user right back to the board where they were."

**Locked refined:**
- Use existing `TypeBadgeTrigger`, `PriorityButton`, assignee dropdown (they already support `stopPropagation`).
- Use the existing priority **icons** from `PRIORITY_META`, not just dots.
- Card body has `onClick` that navigates to `?view=board&ticket=T-X` (pushed, not replaced). TanStack `navigate({ search: prev => ({ ...prev, ticket: id }) })`.
- Browser back returns to `?view=board` automatically.

### Q8 — Edge cases (batched defaults)

| # | Edge case | Default |
|---|---|---|
| 1 | Completed sprint | Read-only: `draggable` not attached, `canDrop` false. Existing `sprints_completed_closed_notice` banner. |
| 2 | Empty column | Empty space. Tail drop zone still works. No placeholder text. |
| 3 | Create from board | ~~Skip for v1.~~ **User flipped this:** "We can have the ticket create input stay between views at the top." Creator lives in `SprintDetail` above the view tabs, visible in both views. |
| 4 | Keyboard DnD / a11y | Pointer-only for v1. **User:** "fine, but make sure to document nicely with TODO and/or FIXME comments." |
| 5 | Mobile / touch | Out of scope. Columns overflow horizontally. |
| 6 | Ticket-not-found / unknown status | Skip rendering missing tickets. Bucket unknown status into hidden "other" group, surface only if non-empty. |
| 7 | Optimistic failure rollback | `Atom.optimisticFn` auto-reverts. Clear the pending-status overlay in `Effect.ensuring` (handles both success and error paths). |

---

## Part 2 — Locked decisions (consolidated)

| # | Decision | Detail |
|---|---|---|
| 1 | **DnD lib** | `@atlaskit/pragmatic-drag-and-drop`. Installed. Pragmatic uses native HTML5 drag preview on the compositor — zero React renders during the drag. |
| 2 | **Reorder animation** | `@formkit/auto-animate` on each column's list (180ms ease-out). `motion` drop-flash on the landed card. |
| 3 | **Ordering source** | Sprint's existing `Group.tickets[]` array. No new `position` field on tickets, no join table. |
| 4 | **API surface** | New endpoint `PATCH /orgs/:orgSlug/projects/:slug/groups/:id/ticket-order`, op id `updateTicketOrder`. Atomic on server. Payload: `{ ticketId, status?, after: TicketId \| null }`. Errors: Unauthorized, NotFound, Forbidden, SprintCompletedImmutable, Validation. |
| 5 | **View toggle** | URL search param `?view=list \| board` on `/sprints/$groupId`. Default `list`. `SegmentedTabs` in `SprintDetailHeader` between days-left chip and SprintMenu. Use `default` variant + Rows3/Columns3 icons. `renderItem` is just `<button>{content}</button>` — SegmentedTabs renders the active motion indicator internally. |
| 6 | **Sprint creator placement** | `SprintTicketCreator` (or completed-notice) lives in `SprintDetail` body above the view tabs. Visible in both views. |
| 7 | **Board frame** | Measured height via `useLayoutEffect` + `ResizeObserver(document.body)` reading `window.innerHeight - rect.top - 56` with a 240px floor. Internal vertical scroll per column, internal horizontal scroll for overflow columns. Full width of `<main>` (escapes `PageContainer`). |
| 8 | **Page chrome** | `PageContainer` moved out of `ProjectLayout`'s Outlet wrapper. Header + tabs nav still wrapped. Each tab opts in: tickets/about/members/sprints-index all wrap their content in PageContainer. Sprint detail wraps header + creator in PageContainer; body either wraps (list view) or goes full-bleed (board view). |
| 9 | **Card component** | New `SprintBoardCard`, not a TicketList variant. Reuses `TypeBadgeTrigger`, `PriorityButton`, assignee dropdown, `GithubChip`, `TagChip`. |
| 10 | **Card content** | Line 1: type icon (clickable dropdown) + title (`text-sm`, `font-medium`, 2-line clamp). Line 2: priority icon (clickable dropdown) + ID (mono, muted) + git chip + assignee avatar (clickable dropdown). Tags hidden in board view (v2). Card body onClick navigates to `?view=board&ticket=T-X` (pushed). |
| 11 | **Optimism** | `placeTicketAtom` family-keyed by sprintKey (`orgSlug/slug/groupId`). `Atom.optimisticFn(sprintsListAtom(projectKey))` reducer reorders `tickets[]`. `pendingTicketStatusAtom = Atom.family(sprintKey → Map<TicketId, TicketStatus>)` overlay. Fn sets overlay before server call, clears in `Effect.ensuring`. Board grouping reads status as `overlay.get(t.id) ?? t.status`. |
| 12 | **Failure** | Optimistic reducer auto-reverts on mutation error. Overlay cleared in `Effect.ensuring`. Surface error via existing toast pattern (errorMessage.ts). |
| 13 | **Completed sprint** | Board read-only. `draggable` not attached. Existing notice banner visible. |
| 14 | **Empty column** | Empty space. Tail drop zone active for "drop at end". No placeholder text. Header count of `0` does the work. |
| 15 | **A11y** | Pointer-only v1. `// TODO(kanban-a11y): wire @atlaskit/pragmatic-drag-and-drop-keyboard adapter` at the board frame + each `draggable` attachment. |
| 16 | **Mobile** | Out of scope. |
| 17 | **Unknown statuses** | Bucket into hidden "other" group; surface only if non-empty. Future-proofs for configurable statuses. |
| 18 | **Click navigation** | `navigate({ search: prev => ({ ...prev, ticket: id }) })`. Pushed history. |

---

## Part 3 — Files

### Already created / modified (steps 1–4)

**Shared:**
- `packages/shared/src/schemas/Group.ts` — `UpdateTicketOrderInput` added. Imports `TicketStatus`.
- `packages/shared/src/api.ts` — `updateTicketOrder` endpoint added.

**Backend:**
- `packages/backend/src/services/Groups.ts` — service tag gained `updateTicketOrder` method.
- `packages/backend/src/Layers/Groups.ts` — implementation. Splice logic + atomic ticket-status patch.
- `packages/backend/src/handlers/groups.ts` — wired with existing `dieOnMarkdown` pattern.
- `packages/backend/src/Services/Groups.test.ts` — 6 new tests. `ticketDocs.write` fake now supports writes.

**Frontend atoms:**
- `packages/frontend/src/atoms/sprints.ts` — added `pendingTicketStatusAtom` family + `placeTicketAtom` family (optimistic over `sprintsListAtom`, refreshes `sprintsListBaseAtom` + `ticketsListAtom`).

**Frontend routes / layout:**
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` — `PageContainer` moved to wrap only header+tabs. Outlet renders bare in a `flex flex-col gap-6` wrapper.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/index.tsx` — local `PageContainer` wrap.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/about.tsx` — local `PageContainer` wrap.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/members.tsx` — local `PageContainer` wrap.
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/index.tsx` — wrap skeleton/empty (not the redirect).
- `packages/frontend/src/routes/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId.tsx` — `validateSearch` gained `view: "list" \| "board"`. Reads `view`, builds `setView`, passes to `SprintDetail`. No PageContainer wrapper (SprintDetail manages its own).

**Frontend components:**
- `packages/frontend/src/components/sprints/SprintDetail.tsx` — restructured. Header + creator in PageContainer. Body: PageContainer-wrapped list OR full-bleed `<SprintBoard>`.
- `packages/frontend/src/components/sprints/SprintDetailHeader.tsx` — props `view` + `onChangeView`. `<ViewTabs>` renders between days-left chip and SprintMenu. Plain `<button>{content}</button>` renderItem.
- `packages/frontend/src/components/sprints/SprintTicketList.tsx` — stripped inline creator (now `creator={null}`).
- `packages/frontend/src/components/sprints/SprintBoard.tsx` — stub with measured height. TODO(kanban-a11y) comment.

**i18n:**
- `packages/frontend/messages/en/sprints.json` — `sprints_view_list`, `sprints_view_board`, `sprints_view_tabs_aria_label`.

### Still to create

```text
packages/frontend/src/components/sprints/SprintBoardColumn.tsx   ← column wrapper + tail drop zone
packages/frontend/src/components/sprints/SprintBoardCard.tsx     ← draggable card
packages/frontend/src/components/sprints/-board-utils.ts         ← edge math, neighbor lookup, grouping with overlay
```

### Still to modify

- `packages/frontend/src/components/sprints/SprintBoard.tsx` — replace stub with real board (columns + DnD wiring).
- `packages/frontend/src/lib/errorMessage.ts` — map any new tagged errors from `updateTicketOrder` if needed (likely none beyond the standard ones already mapped).

### To delete in final cleanup

```text
packages/frontend/src/routes/(public)/spike/-shared.tsx
packages/frontend/src/routes/(public)/spike/route.tsx
packages/frontend/src/routes/(public)/spike/index.tsx
packages/frontend/src/routes/(public)/spike/pragmatic.tsx
```

---

## Part 4 — Remaining build sequence

### Step 5 — `SprintBoardCard`

Build in isolation. Vertical card layout. Inline-edit dropdowns nested via existing components. Click on card body (not on dropdowns) navigates to `?view=board&ticket=T-X`.

Reuses:
- `TypeBadgeTrigger` from `@/components/TicketList/TypeField` (already accepts `stopPropagation`)
- `PriorityButton` from `@/components/TicketList/PriorityField` (already accepts `stopPropagation`)
- Assignee inline editor from `@/components/TicketList/AssigneeField`
- `GithubChip` from `@/components/GithubChip`
- `PRIORITY_META` icons (not just dots)

Reads ticket data from `ticketsListAtom`. Status read via overlay merge (helper from `-board-utils.ts`).

Verify: dropdowns work nested inside a draggable wrapper. Pragmatic respects HTML5 drag semantics — buttons/inputs aren't draggable by default. Confirm by testing.

### Step 6 — `SprintBoardColumn` + real `SprintBoard`

Port spike logic from `routes/(public)/spike/pragmatic.tsx`:
- Each card wrapper is draggable + drop target.
- Drop target's `getData` computes `edge: "top" | "bottom"` from pointer Y vs card midpoint.
- Insertion line via absolute-positioned 2px bar, centered on wrapper boundary.
- Hide indicator on self (`source.data.id === self ticket.id`).
- Per-card wrapper uses `relative px-2 py-1` to make hitboxes meet adjacent ones (no dead gutters).
- Column list: `gap-0`, `py-2`. Each card wrapper's `px-2` extends hitbox to column edges.
- `ColumnTail` component: `flex-1 min-h-4 px-2`, drop target type `column` for "drop at end" semantics. Tail indicator at top edge when non-empty.
- Outer column container: NOT a drop target. This makes the scrollbar strip reject drops (snaps back instead of falling through to "append at end").

Spike fixes that must be preserved (these were the iterations that took time):
1. Vertical gutter dead zone — fix: `py-1` on wrapper, `gap-0` on list.
2. Self-drop falling through to column → "append at end" — fix: `canDrop` returns true for self but indicator suppressed; monitor short-circuits when `dst.id === src.id`.
3. Horizontal gutter dead zone (drops on column sides → "append at end") — fix: move horizontal padding from list to wrappers (`px-2` on wrapper, `py-2` only on list).
4. Scrollbar strip → "append at end" — fix: remove column-level drop target, add `ColumnTail` with `flex-1`.

Auto-animate on column lists with `duration: 180, easing: "ease-out"`.

Columns: 3 by default (`todo`, `in_progress`, `done` — `TicketStatus` enum). Plus a hidden "other" group for any future unknown statuses, surfaced only if non-empty.

Read order: sprint's `tickets[]` filtered by `(overlay.get(t.id) ?? t.status) === columnStatus`.

### Step 7 — Wire `placeTicketAtom` to `onDrop`

In the board's `monitorForElements` handler:
```ts
const src: { type: "card", id: TicketId } = ...
const dst: CardDropData | ColumnDropData = ...

let after: TicketId | null
let status: TicketStatus | undefined

if (dst.type === "card") {
  // Compute "after" from edge:
  //  - edge: "bottom" → after = dst.id
  //  - edge: "top"    → after = ticket before dst in tickets[] (or null if dst is first in column-group)
  const inColumn = sprintTickets.filter(/* same status */)
  const idx = inColumn.indexOf(dst.id)
  if (dst.edge === "bottom") {
    after = dst.id
  } else {
    after = idx > 0 ? inColumn[idx - 1] : null
  }
  status = dst.status !== src.currentStatus ? dst.status : undefined
} else {
  // column tail
  const inColumn = sprintTickets.filter(t => effectiveStatus(t) === dst.status)
  after = inColumn[inColumn.length - 1] ?? null
  status = dst.status !== src.currentStatus ? dst.status : undefined
}

place({ ticketId: src.id, status, after })
```

`place = useAtomSet(placeTicketAtom(sprintKey(orgSlug, slug, groupId)))`.

### Step 8 — Card click navigation

`navigate({ to: ".", from: "/_authed/orgs/$orgSlug/projects/$slug/sprints/$groupId", search: prev => ({ ...prev, ticket: ticketId }) })`. Push history.

### Step 9 — Polish

- Motion drop-flash on landed card. Keyed by a flash counter from `useFlashOnLand`-style hook (port from spike).
- `animate-pulse` on cards whose ticket id is in the overlay (status flip pending).
- Completed sprint: cards render but no `draggable` attached, no `dropTargetForElements` on cards. Tail drop zone also disabled. Visual: slight opacity reduction (`opacity-90`) on the whole board.

### Step 10 — Spike cleanup

Delete the `(public)/spike/` directory. Final commit.

---

## Part 5 — Resume instructions (for a fresh context)

If picking this up in a fresh session:

1. **Read** this file (`docs/kanban-plan.md`) fully.
2. **Read** `CLAUDE.md` (project conventions, especially "no architectural decisions without asking", optimistic mutation patterns, the i18n table).
3. **Read** `.impeccable.md` (design rules — sentence case only, no caps headings, neutral chrome, Linear-grade restraint, no shadows on rectangles).
4. **Check** branch: `git status` should show `feat/T-7-kanban-view`. Last commit at time of writing this doc: `1a2607d` (Merge of main). Frontend should typecheck clean (`cd packages/frontend && bun run typecheck`).
5. **Confirm** state:
   - `packages/shared/src/schemas/Group.ts` should have `UpdateTicketOrderInput`.
   - `packages/frontend/src/atoms/sprints.ts` should have `placeTicketAtom` and `pendingTicketStatusAtom`.
   - `packages/frontend/src/components/sprints/SprintBoard.tsx` exists as a stub.
   - Visiting `/orgs/<slug>/projects/<slug>/sprints/<sprint-id>?view=board` should show "Board stub: N tickets".
6. **Resume** at step 5 (`SprintBoardCard`).

Pragmatic DnD reference for step 6 — the spike at `packages/frontend/src/routes/(public)/spike/pragmatic.tsx` has the working drag, edge math, insertion indicator, tail drop zone, and self-drop noop. Port that logic; don't re-derive it.
