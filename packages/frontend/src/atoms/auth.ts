// packages/frontend/src/atoms/auth.ts
//
// AUTH-RELATED ATOMS.
// ============================================================================
// Two atoms, both built on the runtime in `../runtime.ts`:
//
//   - `meAtom`     — query atom: reads `/me` once, caches the result, exposes
//                    a `Result<User, Unauthorized>` to React.
//   - `logoutAtom` — function atom: invokes Better Auth's `signOut()` and
//                    refreshes `meAtom` so the gate kicks in immediately.
//
// THE QUERY ATOM PATTERN
// ----------------------------------------------------------------------------
// `runtime.atom(effect)` produces an Atom whose value, when read in React,
// is `Result<A, E>` — the success/failure of running `effect` once. The
// runtime caches the result and shares it across components. There's no
// React Query equivalent of "useQuery" required: React state, atom state,
// and the Effect graph are the same thing here.
//
// The `E` channel comes through verbatim. Because the `auth.me` endpoint
// declared `addError(Unauthorized)` in the shared contract, the `Result`'s
// failure variant is *typed* as `Unauthorized`. The `_authed` route gate
// pattern-matches on this exact type.
//
// THE FUNCTION ATOM PATTERN
// ----------------------------------------------------------------------------
// `runtime.fn(effect)` produces an atom you call from React with arguments.
// The Effect's `R` channel is provided by the runtime; the call returns a
// promise that resolves to the success value (or rejects with the failure).
//
// Inside the Effect body, you receive a `get` parameter — that's how you
// touch other atoms. `get.refresh(meAtom)` invalidates the cached result
// and tells any reading component to re-run.
//
// CHAPTER 3 STEPS
// ----------------------------------------------------------------------------
//   1. Imports:
//        import { Atom } from "@effect-atom/atom-react"
//        import { Effect } from "effect"
//        import { runtime } from "@/runtime"
//        import { ApiClient } from "@/services/ApiClient"
//        import { authClient } from "@/services/AuthClient"
//
//   2. meAtom:
//        export const meAtom = runtime.atom(
//          Effect.gen(function*() {
//            const client = yield* ApiClient
//            return yield* client.auth.me()
//          })
//        )
//      You may also pipe `Atom.setIdleTTL("1 minute")` once you've seen the
//      atom work. Skip it on the first pass — it's not load-bearing.
//
//   3. logoutAtom:
//        export const logoutAtom = runtime.fn(
//          Effect.fn(function*(_: void, get) {
//            yield* Effect.tryPromise(() => authClient.signOut())
//            get.refresh(meAtom)
//          })
//        )
//
//      Notes:
//      - `Effect.tryPromise` wraps the Better Auth promise call. If sign-out
//        fails for any reason, the Effect fails — but for now, the surface
//        we'd react to is "did the cookie clear?", and the `get.refresh`
//        call exposes that on the next `/me`.
//      - The first parameter is `_: void` because we don't need any input
//        from the caller — `runtime.fn`'s callable always passes one.
//
// READING THESE FROM A COMPONENT
// ----------------------------------------------------------------------------
//   import { useAtomValue, useAtomSet, Result } from "@effect-atom/atom-react"
//
//   const me = useAtomValue(meAtom)               // Result<User, Unauthorized>
//   const logout = useAtomSet(logoutAtom)         // (input: void) => Promise<void>
//
// `Result` has three variants — `Initial`, `Success`, `Failure`. The Failure
// variant carries `cause: Cause<E>`, NOT a raw `error: E`. So `Result.match`'s
// `onFailure` callback receives the Failure variant itself (whose `_tag` is
// just `"Failure"`) — not the error value.
//
// The most ergonomic helper is `Result.matchWithError`, which splits the
// failure path into `onError` (typed errors from your `E` channel) and
// `onDefect` (unexpected throws / interruptions):
//
//   Result.matchWithError(me, {
//     onInitial: () => <p>Loading…</p>,
//     onSuccess: ({ value }) => <p>Hi {value.name}</p>,
//     onError: (error) =>
//       error._tag === "Unauthorized"
//         ? <p>Not signed in</p>
//         : <p>Unexpected error</p>,
//     onDefect: (defect) => <p>Defect: {String(defect)}</p>
//   })
//
// If you only need success/failure granularity (no typed-error narrowing),
// `Result.match` with `onFailure: (failure) => ...` is fine — just remember
// the argument is the Failure variant, not the error.

import { Effect } from "effect"
import { runtime } from "@/runtime"
import { ApiClient } from "@/services/ApiClient"
import { authClient } from "@/services/AuthClient"

export const meAtom = runtime.atom(
  Effect.gen(function* () {
    const client = yield* ApiClient
    return yield* client.auth.me()
  })
)

// Sign out, then refresh meAtom so the gate flips to redirect on the next render.
export const logoutAtom = runtime.fn(
  Effect.fn(function* (_: void, get) {
    yield* Effect.tryPromise(() => authClient.signOut())
    get.refresh(meAtom)
  })
)
