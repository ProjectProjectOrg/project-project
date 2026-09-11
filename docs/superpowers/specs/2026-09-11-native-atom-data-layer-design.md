# Native atom data layer — design

Status: proposed, 2026-09-11. Supersedes the optimistic-mutation section of
`AGENTS.md` and extends `docs/data-fetching-policy.md` once accepted.

## Problem

Optimistic edits flicker when the same entity is shown by more than one cached
projection. PR #200 and PR #216 fixed the visible cases for tickets by adding
"settle keys" to the update mutation: the caller passes the family key of the
list it is rendered in, and the mutation holds its transition open until that
list has refetched. That works, but it is a hand-written copy of what
`Atom.optimistic` already does for the atom it wraps, and it forces every
component to know cache topology.

The root cause is structural. `updateTicketAtom` wraps a detached patch atom
whose source is `Atom.readable(() => ({}))`. When the transition commits,
`Atom.optimistic` refreshes that source, gets `{}` synchronously, and the patch
disappears at once. Every surface that merged the patch by hand (`Row`,
`SprintBoardCard`, `ticketAtom`) drops back to its stale snapshot until its own
refetch lands. The same workaround exists three more times: the pending status
map with source, destination and count keys; the board's pending status
overlay; and the pending sprint assignment map. Across `tickets.ts` and
`sprints.ts` there are eleven `get.result(x, { suspendOnWaiting: true })` holds
whose only job is to keep a transition open.

Around that sit further costs that the greenfield rewrite removes at the same
time:

- Seventeen atom modules, about 4,400 lines, hand-roll `runtime.atom` plus
  fetch, `Atom.family(string)` keyed by concatenated slugs, and `splitXKey`
  parsers that `JSON.parse` the key back apart.
- Reactivity keys are eight ad-hoc string patterns invented per module.
- Components import key builders (`ticketsSectionsKey`, `ticketsCountKey`,
  `sprintKey`, …) and thread them through props to reach mutations.

## Goal

Every user action paints synchronously, stays painted until the server confirms
it, and never flickers back. Components render the value they are given and
call a mutation with the API payload. One convention covers all seventeen
modules. Nothing is invented on top of Effect Atom: the design uses
`AtomHttpApi.Service`, `Atom.optimistic`, `Atom.optimisticFn`, `Atom.mapResult`,
`Atom.readable` with a refresh function, and record-form reactivity keys.

## Decision

> Optimism is per view. A mutation targets the optimistic wrapper of the view it
> fires from. Other views catch up through reactivity keys.

This is how Effect Atom is designed to be used and how the two reference
codebases use it. Neither normalizes entities into a store nor fans a single
transition out to several wrappers.

- `billyhawkes/pally`: a task app on Effect v4. `src/lib/pally-client.ts`,
  `src/lib/atoms/tasks.ts`, `src/components/tasks/task-board-view.tsx`.
- `UsefulSoftwareCo/executor`: production console on Effect v4.
  `packages/react/src/api/client.tsx`, `packages/react/src/api/atoms.tsx`,
  `packages/react/src/api/reactivity-keys.tsx`, and the written convention at
  `.skills/effect-atom-optimistic-updates/SKILL.md`.

A view that another view's mutation touches updates once, old to new, after its
refetch. That is a delayed update, not a flicker, and it is accepted.

## What Effect Atom guarantees

Verified against `node_modules/effect/src/unstable/reactivity/Atom.ts` at
`optimistic` and `optimisticFn`, and the upstream tests.

- `Atom.optimistic(source)` shows the optimistic value while a transition is
  open and ignores every change from `source` during that time.
- On success it calls `refresh(source)` and keeps showing the optimistic value
  until `source` emits a non-waiting `Success` with a newer timestamp. This is
  the no-flicker hold.
- On failure it reverts to the latest source value.
- Concurrent transitions compose. The reducer of a later call receives the
  current optimistic value, so edits stack, and the wrapper refreshes once when
  the last transition closes.
- `optimisticFn({ fn: (set) => ... })` exposes `set` so the mutation can push
  an intermediate value mid-flight. The design uses it to show the confirmed
  server value before the refetch.
- `Atom.readable(read, refresh)` accepts a refresh function, so a derived
  readable can forward `refresh` to its sources. This is what lets a composed
  view-model be wrapped in `Atom.optimistic`.
- `Atom.family` memoizes on `MutableHashMap`, and Effect v4 `Hash.hash` hashes
  plain objects structurally, so a request object is a valid family key.
- `Reactivity` keys accept record form. `{ tickets: [a, b] }` registers
  `tickets`, `tickets:a` and `tickets:b`, so a mutation can invalidate one
  entity, one project, or everything under a resource with the same vocabulary.

## Architecture

### 1. One client

```ts
// packages/frontend/src/api/Api.ts
export class Api extends AtomHttpApi.Service<Api>()("Api", {
  api: AppApi,
  httpClient: FetchHttpClient.layer,
  baseUrl: "/api"
}) {}
```

`Api.runtime` replaces `src/runtime.ts`. Non-HTTP effects that need the client
use `Api.use((c) => c.tickets.update(...))` or `yield* Api`. The `ApiClient`
service, `AppLayer` and the old `runtime` are deleted in the final stage.
`AuthClient` and `mentions/*` move to `Api`. Old and new atoms coexist during
the migration because every `Atom.runtime` built by the default factory shares
one memo map and therefore one `Reactivity` instance.

`Api.query(group, endpoint, request)` is the only way to read server state. It
already provides the family, structural request keys, `timeToLive` for idle
retention, and `reactivityKeys` registration.

### 2. Reactivity key vocabulary

```ts
// packages/frontend/src/api/keys.ts
export const Keys = {
  ticket: (project: string, id: TicketId) => ({ tickets: [`${project}/${id}`] }),
  ticketsIn: (project: string) => ({ tickets: [project] }),
  ticketLists: (project: string) => ({ ticketLists: [project] }),
  sprints: (project: string) => ({ sprints: [project] }),
  sprintMembership: (project: string, groupId?: GroupId) => ({
    sprintMembership: groupId ? [project, `${project}/${groupId}`] : [project]
  }),
  // tags, statuses, members, comments, attachments, github, integrations …
} as const
```

Queries declare the keys they listen to at definition. Mutations declare the
keys they publish inside the atom module. Components never see a key. Existing
string patterns map one to one: `tickets/*` becomes `Keys.ticketsIn`,
`ticket-lists/*` becomes `Keys.ticketLists`, `ticket-content/*/*` becomes
`Keys.ticket`, and so on.

### 3. Reads are wrappers over their own query

Each domain module exports request builders and wrappers. The request object is
the key; there are no string keys and no key parsers.

```ts
// packages/frontend/src/atoms/tickets/backlog.ts
export interface BacklogRequest {
  readonly params: { orgSlug: string; slug: string }
  readonly query: TicketListSearch          // encoded TicketListQuery
}

const backlogQuery = (req: BacklogRequest) =>
  Api.query("tickets", "sections", {
    ...req,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(project(req)), Keys.ticketLists(project(req))]
  })

export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(backlogView(req))
)
```

`backlogView(req)` is the composed readable from section 4: the first page from
`backlogQuery` plus any loaded cursor pages. A view backed by a single query,
such as ticket detail, wraps the query directly.

Derived views use `Atom.mapResult` over the wrapper so they inherit optimism:
a single sprint from the sprint list, tag names for a picker, a count for a
sidebar badge.

### 4. Composed view models

When one screen region needs two queries, compose them in a readable whose
refresh forwards to both sources, then wrap that readable. The wrapper's commit
refresh then refetches every source the region depends on, and the region
holds as one unit.

```ts
const boardView = (req: BoardRequest) =>
  Atom.readable(
    (get) => combineResults(get(sprintQuery(req)), get(sprintTicketsQuery(req)), toBoard),
    (refresh) => { refresh(sprintQuery(req)); refresh(sprintTicketsQuery(req)) }
  )

export const board = Atom.family((req: BoardRequest) => Atom.optimistic(boardView(req)))
```

`combineResults` is a small pure helper in `src/atoms/lib/results.ts`: Success
only when all inputs are Success, `waiting` if any input is waiting, timestamp
is the maximum, first Failure wins. It is a derived-read helper, not an
optimistic layer.

The same pattern serves pagination. Cursor pages are their own `Api.query`
atoms, a small state atom per request lists the loaded cursors, the section
readable concatenates first page plus loaded pages, and its refresh forwards to
all of them. Loaded pages therefore survive a commit refresh and the whole
section holds as one wrapper.

### 5. Mutations are per view, per entity, payload only

```ts
export const updateBacklogTicket = Atom.family(
  ({ req, id }: { req: BacklogRequest; id: TicketId }) =>
    Atom.optimisticFn(backlog(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        Result.map(current, (sections) => applyTicketPatch(sections, id, patch)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTicketInput, get) {
            const ticket = yield* Api.use((c) =>
              c.tickets.update({ params: { ...req.params, id }, payload: patch })
            )
            set(Result.map(get(backlog(req)), (s) => replaceTicket(s, ticket)))
            yield* Reactivity.invalidate([
              Keys.ticket(project(req), id),
              Keys.ticketLists(project(req))
            ])
            return ticket
          })
        )
    })
)
```

Rules:

- The family key is the view request plus the entity id, so `waiting` and
  failure are per row. Path params come from the key. The input is exactly the
  API payload type from `packages/shared`.
- The reducer uses `Result.map(current, …)` so Initial and Failure pass
  through and stacked edits compose. It is pure.
- `fn` calls the API, pushes the confirmed value through `set`, publishes keys
  for other views, and returns the server value. It never waits on another atom
  to hold the transition open. `Api.mutation(group, endpoint)` may be used as
  `fn` directly when no `set` is needed, wrapped so that keys are bound in the
  module rather than at the call site.
- Coalescing of rapid edits on one row, today's `unsaved` merge, stays inside
  `fn` as an implementation detail of the ticket update mutation.

Commit refresh plus key invalidation can restart the local view's fetch once.
Effect Atom cancels and restarts the in-flight read, so this costs latency
rather than a second rendered result. Accepted for phase one; narrowing keys is
a follow-up if it shows up in measurements.

### 6. Structural changes stay inside the wrapper

- Status change from the backlog: one reducer moves the row between sections
  and adjusts `counts.byStatus`. The sections response already carries counts
  and first pages together, and `docs/data-fetching-policy.md` says to keep
  that. `updateTicketStatusAtom` folds into `updateBacklogTicket` with
  `update({ status })`.
- Board placement: one reducer over the composed board view reorders the card
  and changes its column. `placeTicketAtom` becomes `placeBoardTicket(req)`.
- Sprint membership from the backlog: a reducer over the backlog wrapper for
  group-filtered lists, and key publication for the sprint views.
- Quick create: the reducer inserts a placeholder row with `pending: true` and
  the caller's `clientId` as its React key. On response, `set` swaps in the
  created ticket while keeping the `clientId` key through a small identity
  remap state atom read by the view readable. This is view state, not cache.
- Archive, unarchive and delete: reducers over the detail wrapper and the
  backlog wrapper of the view they fire from.

### 7. Waiting and failure in the UI

- Row-level pulse: `useAtomValue(updateBacklogTicket({ req, id })).waiting`.
- Section- or list-level pulse: the wrapper's `result.waiting`.
- Failure: the wrapper reverts by itself; the mutation atom holds the failure
  for the toast or inline message, following the existing `AsyncResult`
  rendering conventions.

### 8. Component contract

```tsx
const sections = useAtomValue(backlog(req))
const update = useAtomSet(updateBacklogTicket({ req, id: ticket.id }))
update({ priority: "high" })
```

Components read a wrapper, render what they receive, and call a view mutation
with a payload. They do not import key builders, merge previews, or read
pending maps. `Row`, `SprintBoardCard`, `PriorityField`, `TypeField`,
`AssigneeField`, `StatusField` and `SectionList` lose their key props and
preview logic.

## What is deleted

`ticketUpdateBaseAtom`, `optimisticTicketUpdateAtom`, `ticketUpdatePreviewAtom`,
`applyOptimisticTicketPreview` in components, `sprintTicketsKey` and
`ticketSectionsKey`, `pendingTicketStatusChangesAtom`, `pendingTicketStatusAtom`,
`pendingSprintAssignmentAtom`, `watchTicketContent`, all eleven
`suspendOnWaiting` holds, every `splitXKey` parser and string key builder,
`ApiClient`, `AppLayer`, and the old `runtime`.

## Non-goals

- No normalized entity store. `Atom.make(value)` resets on refresh, entity idle
  TTL would need coupling to list lifetime, and every consumer would change
  shape. The per-view design gives the same guarantee without it.
- No fan-out helper writing one transition into several wrappers. Native
  primitives plus keys cover the need.
- No RPC. `AppApi` stays an `HttpApi`; `AtomHttpApi` is the matching client.
- No backend response reshaping in this design. The board composes two
  existing endpoints client-side. Merging them server-side is a separate
  `packages/shared` decision for Wouter.
- No SSR hydration or `Atom.serializable` work.

## Module inventory and migration order

Each stage is one PR with registry-level tests in the existing stubbed-fetch
style (`packages/frontend/src/atoms/tickets.sections.test.ts`).

0. Foundations. Add `src/api/Api.ts`, `src/api/keys.ts`,
   `src/atoms/lib/results.ts`. Replace the AGENTS.md mutation section with the
   rules above. Old atoms keep working unchanged.
1. Tickets: backlog sections, detail, search, counts. Migrate `Row`, the field
   buttons, `StatusField`, `SectionList`, quick create, load more, hover card,
   breadcrumbs and the ticket route loader. Delete the ticket settle and
   preview plumbing.
2. Sprints: sprint list and detail, the composed board view, placement,
   add and remove tickets, complete and delete sprint. Migrate `SprintBoard`,
   `SprintBoardColumn`, `SprintBoardCard`, `useBoardTickets`,
   `SprintHeaderFields` and the sprint routes.
3. Aggregates, mechanical: tags, project statuses, projects, orgs and members,
   comments, attachments, storage, figma, everhour, time tracking, github,
   oauth applications and consent, auth. These already have the native
   optimistic shape; the change is `Api.query` plus request keys.
4. Removal: `ApiClient`, `AppLayer`, `runtime.ts`, remaining key helpers.
   Update `docs/data-fetching-policy.md` to reference this design.

## Testing

Per view module, at registry level with a stubbed `fetch`:

- An edit paints synchronously in the wrapper and the row mutation reports
  `waiting`.
- The wrapper keeps the optimistic value until its own refetch resolves; a
  stale list response arriving mid-transition is ignored.
- A failed mutation reverts the wrapper and surfaces the failure on the
  mutation atom.
- Two rapid edits on one row compose and the wrapper refreshes once.
- A status change moves the row between sections and adjusts counts.
- Quick create inserts a placeholder keyed by `clientId` and swaps in the
  created ticket without changing the key.
- Loaded cursor pages survive a commit refresh.
- A mutation in one view refreshes a mounted sibling view through keys.

## Resolved questions

- Per-view mutation atoms with waiting state per view and entity: yes. Both
  reference codebases do this; the AGENTS.md rule that mutation atoms are
  keyed by resource is replaced by "keyed by view request plus entity".
- `AtomHttpApi.Service` as the single client: yes. `AppLayer` contains only
  `ApiClient`, so `Api.runtime` replaces `runtime` outright.
- Cross-view catch-up by refetch: accepted.
- Response shaping: out of scope, see Non-goals.
