# Frontend data layer

Read before adding or changing a read, a mutation or an `AsyncResult` render in `apps/frontend`. The short rules live in `AGENTS.md`.

## Reads, mutations and optimistic updates

**Default to optimistic.** Reads are `Api.query(...)` wrapped in `Atom.optimistic`. Mutations are `viewMutation` (`apps/frontend/src/api/viewMutation.ts`) against the wrapper of the view they fire from. Worked examples and the legacy shapes we removed: `.agents/skills/effect-atom-optimistic-updates/SKILL.md`. Rationale: `docs/superpowers/specs/2026-09-11-native-atom-data-layer-design.md`.

1. **One client.** `apps/frontend/src/api/Api.ts` is the only way to reach the server. Never hand-roll a fetch atom. Calls to better-auth stay `Effect.tryPromise`, but run inside `Api.runtime.fn` so there is one runtime.

2. **Reads are wrappers.** Every exported read is `Atom.family((req) => Atom.optimistic(query(req)))`, and the query stays module-private. Family keys are request objects, never concatenated strings, so there is nothing to parse back apart:

   ```ts
   export type TagsRequest = Readonly<{
     _view: "tags"
     params: Readonly<{ orgSlug: string; slug: string }>
   }>

   const tagsQuery = (req: TagsRequest) =>
     Api.query("tags", "list", {
       params: req.params,
       timeToLive: "2 minutes",
       reactivityKeys: [Keys.tags(scopeOf(req))]
     })

   export const tagsFor = Atom.family((req: TagsRequest) =>
     Atom.optimistic(tagsQuery(req))
   )
   ```

   Each view's request carries a `_view` literal and is built by its own builder (`tagsRequest`, `backlogRequest`, `sprintSectionsRequest`), so two views with the same params cannot take each other's request: `updateBacklogTicket({ req: sprintSectionsReq, id })` does not compile. Requests shared by several reads on purpose (`ProjectRequest`, `OrgRequest`) stay unbranded.

   `Atom.family` hashes its key by Effect's structural equality (`node_modules/effect/src/Equal.ts`), not by reference, so rebuilding the request literal on every render is free. What must be stable is the request's _contents_ — a field that is not structurally equal from one render to the next (a fresh `Date`, a generated id, a callback) is a different key and a second fetch. Export a query only to compose it into another region inside the atom layer (`sprintDetail.ts` exports `sprintQuery` for `sprintBoard.ts`, and nothing else does); components never see one.

3. **Retention and invalidation are declared at the query.** `timeToLive` and `reactivityKeys` sit in the `Api.query` call next to the data they describe, so a view states what it listens to and how long it is kept. Neither belongs in a mutation body.

4. **Read and write through the same wrapper.** The atom a view renders and the atom its editors mutate must be the same one. This is the worst failure mode in this layer: the optimistic value lands on an atom nobody renders, so the edit is invisible until a reload, and nothing errors. Adding a tag did exactly this during the migration — the detail view read `ticketDetail` while four editors still wrote a legacy atom that no longer had a consumer.

5. **Optimism is per view.** A mutation targets the wrapper of the view it fires from. Other views catch up through reactivity keys, updating once, old to new — that is not flicker. Never fan one transition into several wrappers, and never normalise entities into a store. When the same action must feel instant in three views, write three small `optimisticFn` atoms over one shared pure helper (`applyTicketPatch`).

6. **Key mutations by view request plus entity id**, never by the container alone:

   ```ts
   export const deleteTag = Atom.family(
     ({ req, name }: Readonly<{ req: TagsRequest; name: TagName }>) =>
       viewMutation(tagsFor(req), {
         name: "deleteTag",
         predict: (tags, _input: void) => withoutTag(tags, name),
         call: (client) => client.tags.delete({ params: { ...req.params, name } }),
         confirm: (tags) => withoutTag(tags, name),
         publish: () => tagsChanged(scopeOf(req))
       })
   )
   ```

   A mutation atom's `AsyncResult` is per key. Key a row mutation by the project and every row in the list shares one transition, so one failed assignment paints the error state onto every visible row. Values that only change when another read loads (the viewer, the project's estimation mode) are not key material: the view reads them, as `sprintSections` does, so the key doesn't change under an in-flight edit.

   `viewMutation` maps `predict` over the current `AsyncResult`, runs `call` with the API client, pushes `confirm` through `set` and publishes the keys `publish` returns. `confirm: replaceWith` takes the server's value as is; `keepPredicted` is for calls that confirm nothing. Editors that send queued edits (ticket fields, project setup) use `coalescingMutation`, or `coalescingTicketUpdate` in `features/tickets/atoms/ticketRows.ts`, which serializes requests per mutation key and merges only waiting edits into the next payload. Sent fields are removed from the queue, so completed or rejected fields are not replayed. Saves keep their mutation and view mounted until settlement, including after navigation. Active writes finish before the next starts; only the latest invocation confirms into the view. Nested payloads supply a `merge` callback; flat patches use the default shallow merge. Write `Atom.optimisticFn` by hand only when the factory can't express the mutation, such as a timer start that reads the previous timer before calling.

7. **Mutation input equals the API payload.** Path params come from the family key. Cache keys, settle targets and view metadata never appear in the input. A quick-create that must draw a placeholder row takes `{ payload, prediction }`: `call` sends `payload` alone, and `prediction` (client id, project prefix, template priority) only feeds `predict`.

8. **Reactivity keys are array form, built in `src/api/keys.ts`.** `Keys` returns a branded `ReactivityKey`, and `publish` accepts nothing else. Use the bundles for the common lists: `Keys.ticketChanged(scope, id)` for one ticket's content plus every ticket list, `Keys.ticketsChanged(scope)` for the lists alone. Record form also hashes the bare key, which would make any ticket mutation refetch every ticket query. Publish every key another view needs, including each source of a composed region. Prefer not to publish a key your own view registered — the wrapper already refreshes its source when the transition commits, so that is a second refetch per edit — but when the key another view needs is one yours also listens to, publish it anyway: correctness before a saved request.

9. **Reducers are pure,** use `AsyncResult.map(current, ...)` and derive from `current`, so stacked edits compose. Don't set `waiting` yourself — `optimisticFn` marks the provisional value waiting for you. A reducer that returns `current` unchanged is a pulse-only reducer: allowed only when the result is genuinely unpredictable, such as a PR number the server assigns.

10. **Push the confirmed value** through `optimisticFn`'s `set` before returning, so the server's own value is on screen before the refetch lands.

11. **Never hold a transition open** by waiting on a read — no `get.result(x, { suspendOnWaiting: true })` inside a mutation body, no pending map, no preview merge, no React context. The wrapper holds the optimistic value until its own source has refetched; that is the reason we wrap the view rather than the entity. (Firing a mutation from outside React and awaiting its own result is a different thing and is fine: `fireMutation(registry, atom, input)` in `src/api/viewMutation.ts` mounts it, sets it, waits for it to settle and unmounts, resolving to the settled `AsyncResult`.)

12. **Multi-query regions** compose in `Atom.readable(read, (refresh) => ...)` that forwards refresh to every source, with one wrapper around the region. The composed result must report `waiting` while any source is waiting, and must not carry a timestamp older than the value it replaces — `AsyncResult.all` does both, unioning `waiting` and stamping the composed success with the composition time. Get either wrong and the confirmed value is dropped silently, which looks exactly like the bug you were fixing.

13. **Refresh the wrapper, not the query.** `Atom.optimistic` forwards `refresh` to its source (`node_modules/effect/src/reactivity/Atom.ts`, the third argument to `writable`), and queries aren't exported, so `useAtomRefresh(backlog(req))` is both correct and the only option. This reverses the pre-migration rule that had callers refresh a base atom.

14. **Rows bind their update one way.** The view passes its mutation family already bound to its request — `backlogTicketUpdates(req)`, `sprintSectionsTicketUpdates(req)`, `boardTicketUpdates(req)`, `myTicketUpdates(req)` — and `Row` or `SprintBoardCard` calls it with the ticket id, sets through it and renders its failure with `UpdateFailureMarker`, an icon with the message in a tooltip that fits the fixed row height. Rows hold no default mutation and no per-view wrapper component.

**`waiting` means a mutation is in flight, never a read.** Once a wrapper holds a success it ignores a `Success { waiting: true }` from its source — see the `Success` branch of the source subscription in `Atom.optimistic` (`node_modules/effect/src/reactivity/Atom.ts`, around line 2557), which only adopts a source value that is not waiting and is not older. A refetch behind an already-loaded view is therefore invisible through the wrapper, and any loading state driven off a wrapper's `waiting` is dead code. Two consequences:

- Surface `waiting` with `animate-pulse` on the data the mutation changed, never on idle controls.
- When a view genuinely needs the read's in-flight state, expose it next to the wrapper as its own atom — `projectGitStatesWaiting` in `features/github/atoms/github.ts` is `Atom.readable((get) => get(gitStatesQuery(req)).waiting)`. For the same reason, don't wrap a read that nothing mutates: the wrapper costs the refetch transition and buys nothing.
- A form reads its own submitting and error state off the mutation atom rather than mirroring it into `useState`: `const state = useAtomValue(createProject(req))` gives both `state.waiting` and the failure to render. Forms wired through reusable shells (`InlineForm`, `ConfirmButton`) keep their imperative `setBusy` / `setError` API — the shell doesn't know which atom is firing — as do callsites needing richer state than the atom carries, such as which row of a list is in flight.

Types obey the type rule in `AGENTS.md` — nested `Readonly<{ ... }>`, `ReadonlyArray<T>`, `readonly [A, B]`, no `interface`, no per-field `readonly`. That covers request types, mutation inputs and composed view-model types.

Reference: `apps/frontend/src/features/tickets/atoms/backlog.ts` (one sections query plus on-demand cursor pages through `readLoadedPages` and `loadNextPage`, with sort-aware placement in the reducers), `apps/frontend/src/features/sprints/atoms/sprintBoard.ts` (a region composed from two queries), `apps/frontend/src/features/tags/atoms/tags.ts` (`tagsFor` as a plain aggregate, `tagEditor` as a region composed from two wrappers).

## Rendering atom AsyncResults — `AsyncView`, with `AsyncResult.matchWithError` as the escape hatch

A `useAtomValue` on a runtime atom returns a `AsyncResult<A, E>` with four variants: `Initial`, `Success`, `Failure-with-typed-error`, `Failure-with-defect`. **Always handle all four — never just check `AsyncResult.isSuccess` and render a forever-loading state on anything else.** That swallows real errors silently and makes failures invisible.

**The default is `AsyncView`** (`apps/frontend/src/components/shell/AsyncView.tsx`). It takes the result, an `onInitial` render and an `onSuccess` render, and draws both failure paths (typed error and defect) with the shared `ErrorPage` (`apps/frontend/src/components/shell/ErrorPage.tsx`), which wraps the dither shell with a retry button and a home link. Pass `contained` when rendering inside a settings panel or any non-full-page surface, and `reset` to refresh the atom on retry.

```tsx
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { AsyncView } from "@/components/shell/AsyncView"

function ProjectStatusesSettings() {
  const req = statusesRequest(orgSlug, slug)
  const result = useAtomValue(statusesFor(req))
  const refresh = useAtomRefresh(statusesFor(req))

  return (
    <AsyncView
      result={result}
      reset={refresh}
      contained
      onInitial={() => <LoadingSkeleton />}
      onSuccess={({ value }) => <StatusList statuses={value} />}
    />
  )
}
```

**Reach for `AsyncResult.matchWithError`** from `effect/reactivity/AsyncResult` only when a failure needs different UI than `ErrorPage`: a `NotFoundPage` for `NotFound`, a custom title and body, an inline message, or extra content beside the error. It splits the failure path into `onError` (your typed `E` channel — `NotFound`, `Unauthorized`, etc.) and `onDefect` (unexpected throws, decode failures, interruptions). `ProjectLayout.tsx` and `TicketDetail.tsx` are examples.

A few details worth knowing:

- **`onError` receives the typed error itself** (the value from the `E` channel, with its `_tag`), not the Failure variant. Narrow on `error._tag` if you want to render different messages per error kind — but `ErrorPage` already does this via `lib/errorMessage.ts` for any `AppError`, so most callsites use `AsyncView`.
- **`onDefect` receives the unknown cause** (a Cause defect, a thrown JS error, a decode failure). Treat it the same way — pass it to `ErrorPage`, which falls back to `String(defect)` for the detail line.
- **`onSuccess` argument is the Success variant** (`{ value, waiting }`), not the raw value. Destructure `value` to get your data. The `waiting: true` flag is set during an in-flight optimistic mutation (per the optimistic-mutation conventions above) — useful when you want to pulse the success view while a refresh is happening.
- **Don't combine `AsyncView` or `matchWithError` with a separate `if (!AsyncResult.isSuccess) ...` early return.** Pick one. Mixing both is dead code and a refactor hazard.
- **For tiny callsites where you only care about success vs anything else** (e.g. a sidebar count that defaults to 0), `AsyncResult.isSuccess(result) ? result.value : fallback` is fine. Use `AsyncView` once the failure case needs visible UI.
- **Inline mutation errors** come from `mutationErrorText(result, describe?, defect?)` in `lib/mutationError.ts`: `null` until the result fails, then the typed error through `describe` (default `errorMessage`) or `defect` (default `m.error_unknown`). Feature mappers such as `ticketCreateErrorMessage`, `slackActionErrorMessage` and `orgActionError` live beside it. Never show a raw `error.message`.

Reference: `apps/frontend/src/features/statuses/components/StatusList.tsx` for `AsyncView`, `apps/frontend/src/features/projects/components/Projects.tsx` for an inline failure through `matchWithError`, and `features/projects/forms/create-project` for a form reading a mutation atom's own state. `AsyncResult` is imported as `Result` in most components; either alias is fine, but keep one per file.
