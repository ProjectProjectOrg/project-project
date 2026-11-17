---
name: effect-atom-optimistic-updates
description: Use when adding or changing optimistic UI in apps/frontend (instant edits, drag to change status, inline renames, list adds or removes), when a value flickers back to a stale server value after a mutation, or when tempted to add a pending map, settle key, preview merge, or React context to make an edit show instantly.
---

# Effect Atom optimistic updates

Adapted from `UsefulSoftwareCo/executor` (`.skills/effect-atom-optimistic-updates`, MIT).
Full rules: `docs/frontend/data-layer.md`. Original design:
`docs/history/specs/2026-09-11-native-atom-data-layer-design.md`.

## First: where does the edit start?

**From a project view (backlog, sprint page, board, ticket page): it is a
local edit, and there is nothing optimistic to write.** Project views read
only the project's local copy. `localEditFn` sends the edit to the worker,
which applies it to the copy at once and sends the write to the server; every
view re-renders from the copy. No wrapper, no predict, no confirm, no publish.

```ts
// features/tickets/atoms/ticketRows.ts
export const localTicketUpdate = (path: TicketPath) =>
  localEditFn(path, updateEdits(path.id))

// features/tickets/atoms/backlog.ts
export const updateBacklogTicket = Atom.family(
  ({ req, id }: Readonly<{ req: BacklogRequest; id: TicketId }>) =>
    localTicketUpdate({ ...req.params, id })
)

export const backlogTicketUpdates = bindRowMutation(updateBacklogTicket)
```

Use `localTicketUpdate`, `localBulkUpdate`, `localTicketMove` or `localCreate`.
A write the worker doesn't cover yet needs a new intent in `packages/local`
(`Intent`, `PendingWrite`) and its builder in `features/local/lib/localIntents.ts`,
not a server path in the view.

**From an org-wide surface (My Work, dashboard, hover cards, `TicketPeek`, Cmd K
on a dashboard row): `localFirst`.** The project's copy may not be ready there,
so `localFirst(project, server, toLocal)` takes the local edit when
`localEditing(project)` and otherwise runs `server`, a plain optimistic server
mutation on that org-wide view (`coalescingTicketUpdate`, `bulkUpdateTickets`).

**A write the copy doesn't hold at all** (comments, sprint create/delete and
membership, sprint descriptions, mark/move/split, statuses, tags, settings, a
creator that must open the new ticket): an optimistic server mutation, below.

## Server optimistic updates

`Atom.optimistic` and `Atom.optimisticFn` already track transitions, stack
racing edits, hold the optimistic value until the wrapped source has refetched,
and roll back on failure. Use them directly on the view the user is looking at.
Do not build a second layer on top.

**Optimism is per view.** A mutation targets the optimistic wrapper of the
view it fires from. Other views that show the same entity catch up through
reactivity keys, or for a local view through the copy once the write's live
event pulls it. That later view updates once, old to new. That is not
flicker. Flicker is new, then old, then new, and it only happens when a
transition ends before the view's own source has refetched, which is exactly
what a wrapper around that view prevents.

## Pattern

```ts
// 1. Query, from `@/api/query`. Declares what it listens to; revalidates on focus and remount.
const tagsQuery = (req: TagsRequest) =>
  query("tags", "list", {
    params: req.params,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.tags(scopeOf(req))]
  })

// 2. Wrapper. Family-keyed so every consumer shares transition state.
//    (tagsFor also reads the local copy in an opened project, through readLocal.)
export const tagsFor = Atom.family((req: TagsRequest) =>
  Atom.optimistic(tagsQuery(req))
)

// 3. Mutation. Keyed by view request (+ entity id when it targets one). Input is the API payload.
export const createTag = Atom.family((req: TagsRequest) =>
  viewMutation(tagsFor(req), {
    name: "createTag",
    predict: (tags, input: CreateTagInput) => [...tags, syntheticTag(input)],
    call: (client, input) =>
      client.tags.create({ params: req.params, payload: input }),
    confirm: (tags, created, input) =>
      tags.map((tag) => (tag.name === input.name ? created : tag)),
    publish: () => [Keys.tagUsage(scopeOf(req))]
  })
)
```

`viewMutation` (`apps/frontend/src/api/viewMutation.ts`) wraps
`Atom.optimisticFn` with the rules built in: `predict` is mapped over
the current `AsyncResult`, `confirm` goes through `set` before the call
returns, `publish` only takes keys from `Keys`. Queued ticket edits on org-wide
views use `coalescingTicketUpdate`, which serializes writes per mutation key
and merges waiting edits into the next request. Nested patches supply a `merge`
callback; flat patches use the default shallow merge.

A server write may also predict into a local view: the backlog composer creates
on the server (it opens the new ticket, so it needs the real id) and predicts
its row into `backlog(req)`, which keeps an `Atom.optimistic` for that reason.

## Rules

1. Read and write through the same wrapper. Reading the plain query while
   writing through the optimistic mutation shows jumps.
2. Wrap inside `Atom.family`. A bare `Atom.optimistic(...)` in a component
   builds a fresh wrapper each render and loses transition state.
3. Reducer: `Result.map(current, …)`, derive from `current`, stay pure.
   `current` already includes in-flight edits, so edits stack.
4. `call` runs the API, `confirm` pushes the server's value, `publish` names
   the keys for other server views. Never wait on another atom to hold the
   transition.
5. Keys live in the atom module. Components send the payload only. Publish
   every key needed by affected sibling queries, even when the initiating query
   shares that key. Check all sources of composed views. Batch mutations that
   partially succeed must invalidate server reads on failure too. Don't publish
   a key no query registers.
6. A screen region that needs two server queries composes them in
   `Atom.readable(read, (refresh) => { refresh(a); refresh(b) })` and wraps
   that. One wrapper per region.
7. Placeholders for created rows use a client id as the React key and get
   swapped by `set` on response (`createdKeys` keeps that key once the real row
   arrives from the copy).
8. Rapid ticket edits accumulate waiting payload fields while earlier writes
   finish. Sent fields leave the queue and are not replayed after success or
   failure. Saves keep their mutation and view mounted until settlement.
   Requests run sequentially per mutation key; waiting edits coalesce, and an
   earlier response never replaces a newer prediction.
9. Use a consistent comparator while edits are pending and after confirmation.

## Do not build these

| Shape | Why it is wrong |
|---|---|
| A server read behind a project view, or a server branch in a project view's edit | Project views read only the copy; the loader covers them until it is ready |
| A pending map atom merged into a readable | Re-implements transition tracking (or the worker's pending edits); races on rapid edits |
| Settle keys or cache topology in the mutation input | Leaks cache topology into components |
| `get.result(x, { suspendOnWaiting: true })` to hold a transition | The wrapper already holds until its source refetches |
| A preview merge in components | The wrapper's value (or the copy) is already the preview |
| A React context of pending values | Invisible to atoms, never expires, per-consumer |
| Timestamp or `issuedAt` guards to decide which snapshot to patch | Manual version of the wrapper's timestamp check |

## Red flags, stop

- "Fall back to the server until the copy is ready."
- "There is nothing specific to await, so add a timestamp guard."
- A new `pending*Atom`, `Map`, `Set`, `try/finally` cleanup, or
  `useState` holding a value the server has not confirmed.
- A mutation input with a field the API does not accept.

## When another view must feel instant too

For a local edit it already does: every project view reads the same copy. For
a server write, fire the mutation from that view's own wrapper. If the same
action is available in three server views, write three small `optimisticFn`
atoms over one shared `applyPatch` helper (`updateOrgTicket` in `myTickets.ts`).
Do not fan one transition into several wrappers and do not normalize entities
into a store.
