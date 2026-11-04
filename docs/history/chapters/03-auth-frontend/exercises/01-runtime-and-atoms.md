# 01 — Runtime and the `meAtom`

## Goal

Set up `Atom.runtime` for the frontend, then build the `meAtom` query that loads `GET /me` once and exposes the result to React as a `Result<User, Unauthorized>`.

By the end, `meAtom` is the single source of truth for "is the user signed in, and who are they?" — both the login redirect and the authenticated home will read it.

## Concepts practiced

- `Atom.runtime(layer)` as the bridge between Effect's `Layer` graph and React's render cycle.
- `runtime.atom(effect)` as a query cache cell — replaces `useState + useEffect + Effect.runPromise`.
- `runtime.fn(effect)` as a one-shot mutation that can refresh other atoms.
- `Result.match` for exhaustive loading/success/failure rendering (you'll see it in action in Section 03).
- Why `Effect.tryPromise` is the right wrapper for Better Auth's promise calls.

## Files you'll touch

- `packages/frontend/src/runtime.ts` — new file, stubbed for you.
- `packages/frontend/src/services/AuthClient.ts` — new file, stubbed for you. (`logoutAtom` will need this.)
- `packages/frontend/src/atoms/auth.ts` — new file, stubbed for you.

## Steps

### 1. Build the runtime

Open `packages/frontend/src/runtime.ts`. The file's comments lay out the shape; fill in the three TODOs.

Two questions to ask yourself as you write it:

- Why is this `Layer.mergeAll(...)` and not `Layer.provide(...)`? (Hint: which direction is "this depends on that"?)
- If we add a `LocalStorage` service in a future chapter, what one-line change is needed here?

### 2. Configure the Better Auth React client

Open `packages/frontend/src/services/AuthClient.ts`. The file is one import + one export. Fill it in.

Worth pausing on: this is _not_ an `Effect.Service`. The walk-through in `runtime.ts`'s comment block explains why; the short version is "wrapping it in Effect doesn't pay for itself."

### 3. Define `meAtom`

Open `packages/frontend/src/atoms/auth.ts`. Skip `logoutAtom` for now — we'll wire it in Section 04.

Write `meAtom` first. The shape is in the file's comment block. After you write it, look at its inferred type:

```ts
import type { Atom } from "@effect-atom/atom-react"
type MeAtom = typeof meAtom
//        ^? Atom.Atom<Result.Result<User, Unauthorized>>
```

If you see `unknown` instead of `Unauthorized`, that's a hint: the `R` channel of the inner Effect isn't being erased properly — most often because `ApiClient.Default` isn't reachable from `AppLayer`.

### 4. Smoke-test the atom from the existing home

The existing `routes/index.tsx` is a smoke test we'll replace in Section 03. For now, modify just the `Show /me` button to read `meAtom` instead of running an Effect by hand. This is a 5-line change and proves the atom round-trips:

```tsx
import { useAtomValue, Result } from "@effect-atom/atom-react"
import { meAtom } from "../atoms/auth"

// ... inside the component:
const me = useAtomValue(meAtom)
const meRendered = Result.matchWithError(me, {
  onInitial: () => "(loading…)",
  onSuccess: ({ value }) => JSON.stringify(value, null, 2),
  onError: (error) => `error: ${error._tag}`,
  onDefect: (defect) => `defect: ${String(defect)}`
})
```

> **Why `matchWithError` and not `match`?** `Result.Failure` carries
> `cause: Cause<E>`, not a plain `error: E`. So `Result.match`'s `onFailure`
> receives the Failure variant itself (whose `_tag` is `"Failure"`, not
> `"Unauthorized"`). `matchWithError` splits the failure path into `onError`
> (typed errors from your declared `E` channel) and `onDefect` (unexpected
> throws / interruptions). `error._tag` is then narrowed to `"Unauthorized"`
> as you'd expect. If you don't need typed-error narrowing, `Result.match`
> with `onFailure: (failure) => ...` is fine — just access `failure.cause`,
> not `failure.error`.

Replace the `<pre>{me ? JSON.stringify(...) : "..."}</pre>` block with `<pre>{meRendered}</pre>`. Delete the `meLoading` boolean and the `handleFetchMe` button — you don't need them anymore. The atom auto-loads on mount.

### 5. Verify

- `bun run --filter @projectproject/frontend typecheck` passes.
- `bun run --filter @projectproject/frontend dev` starts.
- With the backend running, opening `http://localhost:5173/` shows either:
  - `error: Unauthorized` (you're not signed in), or
  - the user JSON (you signed in via Section 00 / Chapter 2's smoke test).
- The atom only fires _one_ `GET /me` per page load — check the Network tab.

## Acceptance criteria

- [ ] `runtime.ts` exports `AppLayer` and `runtime`. The runtime types as `Atom.AtomRuntime<ApiClient, never>` (or similar).
- [ ] `AuthClient.ts` exports a configured `authClient`.
- [ ] `atoms/auth.ts` exports `meAtom` whose inferred type is `Atom.Atom<Result<User, Unauthorized>>`.
- [ ] The smoke-test home renders the `/me` result via the atom — no manual `Effect.runPromise` for /me anymore.
- [ ] Only one network request to `/api/me` per page load.

## Hints

- `runtime.atom` takes the Effect directly. Don't pre-`provide` `ApiClient.Default` — the runtime does that.
- If TypeScript complains that `client.auth.me()` doesn't exist, you've got a stale `routeTree.gen.ts` or the shared package didn't rebuild. Save `packages/shared/src/api.ts` once to retrigger.
- `Result` is re-exported from `@effect-atom/atom-react`. You don't need to import it from `effect`.
- For "the atom only loads once" verification, the simplest test is to navigate to `/` twice via `<Link>` (we don't have one yet — open in a new tab and watch the request count). The atom's idle TTL is large by default, so a quick second request won't re-fire.
