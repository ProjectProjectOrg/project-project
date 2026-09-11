---
name: effect-atom-optimistic-updates
description: Use when adding or changing optimistic UI in packages/frontend (instant edits, drag to change status, inline renames, list adds or removes), when a value flickers back to a stale server value after a mutation, or when tempted to add a pending map, settle key, preview merge, or React context to make an edit show instantly.
---

# Effect Atom optimistic updates

Adapted from `UsefulSoftwareCo/executor` (`.skills/effect-atom-optimistic-updates`, MIT).
Full design: `docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`.

## Overview

`Atom.optimistic` and `Atom.optimisticFn` already track transitions, stack
racing edits, hold the optimistic value until the wrapped source has refetched,
and roll back on failure. Use them directly on the view the user is looking at.
Do not build a second layer on top.

**Optimism is per view.** A mutation targets the optimistic wrapper of the
view it fires from. Other views that show the same entity catch up through
reactivity keys. That later view updates once, old to new. That is not
flicker. Flicker is new, then old, then new, and it only happens when a
transition ends before the view's own source has refetched, which is exactly
what a wrapper around that view prevents.

## Pattern

```ts
// 1. Query. Declares what it listens to.
const backlogQuery = (req: BacklogRequest) =>
  Api.query("tickets", "sections", {
    ...req,
    timeToLive: "2 minutes",
    reactivityKeys: [Keys.ticketsIn(project(req))]
  })

// 2. Wrapper. Family-keyed so every consumer shares transition state.
export const backlog = Atom.family((req: BacklogRequest) =>
  Atom.optimistic(backlogQuery(req))
)

// 3. Mutation. Keyed by view request + entity id. Input is the API payload.
export const updateBacklogTicket = Atom.family(
  ({ req, id }: { req: BacklogRequest; id: TicketId }) =>
    Atom.optimisticFn(backlog(req), {
      reducer: (current, patch: UpdateTicketInput) =>
        Result.map(current, (s) => applyTicketPatch(s, id, patch)),
      fn: (set) =>
        Api.runtime.fn(
          Effect.fn(function* (patch: UpdateTicketInput, get) {
            const ticket = yield* Api.use((c) =>
              c.tickets.update({ params: { ...req.params, id }, payload: patch })
            )
            set(Result.map(get(backlog(req)), (s) => replaceTicket(s, ticket)))
            yield* Reactivity.invalidate([Keys.ticket(project(req), id)])
            return ticket
          })
        )
    })
)
```

Component:

```tsx
const sections = useAtomValue(backlog(req))
const update = useAtomSet(updateBacklogTicket({ req, id: ticket.id }))
update({ priority: "high" })
```

## Rules

1. Read and write through the same wrapper. Reading the plain query while
   writing through the optimistic mutation shows jumps.
2. Wrap inside `Atom.family`. A bare `Atom.optimistic(...)` in a component
   builds a fresh wrapper each render and loses transition state.
3. Reducer: `Result.map(current, …)`, derive from `current`, stay pure.
   `current` already includes in-flight edits, so edits stack.
4. `fn`: call the API, push the confirmed value with `set`, publish keys for
   other views, return. Never wait on another atom to hold the transition.
5. Keys live in the atom module. Components send the payload only.
6. A screen region that needs two queries composes them in
   `Atom.readable(read, (refresh) => { refresh(a); refresh(b) })` and wraps
   that. One wrapper per region.
7. Structural changes (status move, reorder, add, remove) are reducers over
   the region's wrapper. Placeholders for created rows use a client id as the
   React key and get swapped by `set` on response.

## Do not build these

These exist in the codebase today and are being removed. Do not extend them
or copy their shape.

| Legacy shape | Where | Why it is wrong |
|---|---|---|
| Pending map atom merged into a readable | `pendingTicketStatusChangesAtom`, `pendingTicketStatusAtom`, `pendingSprintAssignmentAtom` | Re-implements transition tracking; races on rapid edits |
| Settle keys in the mutation input | `sprintTicketsKey`, `ticketSectionsKey` | Leaks cache topology into components |
| `get.result(x, { suspendOnWaiting: true })` to hold a transition | `tickets.ts`, `sprints.ts` | The wrapper already holds until its source refetches |
| Preview merge in components | `applyOptimisticTicketPreview`, `ticketUpdatePreviewAtom` | The wrapper's value is already the preview |
| React context of pending values | `TagRenamesProvider` | Invisible to atoms, never expires, per-consumer |
| Timestamp or `issuedAt` guards to decide which snapshot to patch | any | Manual version of the wrapper's timestamp check |

## Red flags, stop and use the wrapper

- "The equivalent already exists in tickets.ts, follow that convention."
- "There is nothing specific to await, so add a timestamp guard."
- "Same race class as the existing code, acceptable for the release."
- A new `pending*Atom`, `Map`, `Set`, `try/finally` cleanup, or
  `useState` holding a value the server has not confirmed.
- A mutation input with a field the API does not accept.

## When another view must feel instant too

Fire the mutation from that view's own wrapper. If the same action is
available in three views, write three small `optimisticFn` atoms over one
shared `applyPatch` helper. Do not fan one transition into several wrappers
and do not normalize entities into a store.
