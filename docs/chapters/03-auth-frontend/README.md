# Chapter 3 — Auth on the frontend: atoms, the typed client, and route gating

## What this chapter teaches

By the end of this chapter you will have:

- A real `Atom.runtime` set up in the frontend, and a `meAtom` query that loads `/me` once and caches the result.
- A `/login` page that uses the Better Auth React client to start the GitHub OAuth flow.
- A pathless `_authed` route layout that redirects unauthenticated users to `/login` and renders its children for everyone else.
- A logout flow wired to the same atom so logging out in one place updates every component reading `meAtom`.

The point isn't "we have a login screen". The point is the **patterns** this chapter introduces, which every later chapter will build on:

- `Atom.runtime(layer).atom(effect)` as a query cell — what `useState + useEffect + fetch` should always have been.
- `Result<A, E>` as the loading/success/failure shape — explicit, typed, exhaustive in `Result.match`.
- `runtime.fn` for one-shot mutations (logout) that invalidate cached atoms.
- TanStack Router pathless layouts (`_authed.tsx`) for cross-cutting route concerns.
- The Better Auth React client as a thin wrapper over `/api/auth/*` — we don't try to fold it into Effect.

## Concepts

The **backend walk-through** is short this chapter — there is no new backend code to walk through. The Chapter 2 `/me` endpoint is already typed end-to-end. Read it for the one-paragraph reminder of how the frontend cookie reaches the backend handler.

### `Atom.runtime` — what it is and what it replaces

In the smoke-test home page from Chapter 2, every API call followed the same shape:

```ts
const [data, setData] = useState(null)
useEffect(() => {
  Effect.runPromise(program).then(setData)
}, [])
```

That's three problems wearing a trenchcoat: it's untyped state, it re-runs on every mount, and it doesn't share results between components. Three components asking for the current user fire three `/me` requests.

`Atom.runtime` solves all three. You define a `runtime` once (with the same Layer your app uses for DI), then turn an `Effect` into an `Atom`:

```ts
const meAtom = runtime.atom(
  Effect.gen(function*() {
    const client = yield* ApiClient
    return yield* client.auth.me()
  })
)
```

The atom is a *cache cell*. Any component that reads it gets the same `Result<User, Unauthorized>`. The Effect runs once on first read and is garbage-collected after a configurable idle TTL (`Atom.setIdleTTL("1 minute")`).

### `Result` is the loading/success/failure shape

`Result<A, E>` is a tagged union with three variants: `Initial`, `Success`, `Failure`. When you read an atom in a component, you get a `Result` — the atom is either still loading, succeeded, or failed.

```tsx
const me = useAtomValue(meAtom)
return Result.matchWithError(me, {
  onInitial: () => <p>Loading…</p>,
  onSuccess: ({ value }) => <p>Hi {value.name}</p>,
  onError: (error) => <p>{error._tag}</p>,
  onDefect: () => <p>Unexpected error</p>
})
```

This is the place `Schema.TaggedError` from Chapter 2 starts paying off: `error._tag` is `"Unauthorized"` because that's what we declared on the endpoint. The compiler knows it. So does the runtime — Effect deserialized the JSON error response into a real `Unauthorized` instance using the schema in `packages/shared/src/errors.ts`.

> A subtlety worth knowing now: `Result.match` exists too, but its `onFailure` callback receives the *Failure variant* (with `cause: Cause<E>`), not the raw error. `matchWithError` splits the failure path into `onError(error: E, ...)` and `onDefect(defect: unknown, ...)` — that's the helper you want when you have typed errors to narrow on.

### `runtime.fn` for mutations

Reads use `runtime.atom`; one-shot mutations use `runtime.fn`. A "logout" button triggers an Effect, which in turn invalidates `meAtom` so any component reading it gets a fresh `/me` failure.

```ts
const logoutFn = runtime.fn(
  Effect.fn(function*(_: void, get) {
    yield* /* call /api/auth/sign-out */
    get.refresh(meAtom)
  })
)
```

The `get.refresh(meAtom)` call is the cache-invalidation seam. Atoms are query keys; refreshing one is "this datum is now stale, re-run its Effect."

### Better Auth's React client vs the typed HttpApiClient

There are two clients in the frontend, and they own different parts of the auth surface:

- **`HttpApiClient.make(AppApi)`** — *our* typed client, used for everything in `AppApi`. After login, every protected endpoint goes through this. The `Unauthorized` error in the `E` channel is what the `_authed` gate watches.
- **`createAuthClient` from `better-auth/react`** — Better Auth's own client, used for the OAuth dance: `signIn.social({ provider: "github" })`, `signOut()`, etc. It hits `/api/auth/*` directly. This is the same family of routes Better Auth's server-side handler implements; we don't reproduce them in `AppApi`.

Don't try to fold the Better Auth client into Effect. It's promise-based; calling it from a handler with `await` is fine. The seam is clean: Better Auth owns sessions and OAuth; we own the typed app API.

### Pathless layouts and route gating

TanStack Router's file-based routing treats a file starting with `_` as a **pathless layout**. `routes/_authed.tsx` does *not* contribute a `/_authed` segment to the URL — its children render at the URL their own filename implies. So `routes/_authed.index.tsx` renders at `/`, not `/_authed/`.

This is exactly what the spec described: every authenticated route nests under `_authed`, the login route stays outside. The gate's only job is "if `meAtom` failed, redirect; otherwise render `<Outlet />`."

We use the *component-level* gate (read the atom, render either `<Navigate />` or `<Outlet />`) rather than the `beforeLoad` registry pattern from the spec. The component approach is simpler, integrates naturally with `Result.match`, and works without us having to teach TanStack Router about the atom registry. We may revisit `beforeLoad` in a later chapter once the registry pattern earns its keep.

## Further reading

- `@effect-atom/atom-react` README and recipes: <https://github.com/effect-atom/atom>
- `Result` matching: <https://effect.website/docs/data-types/either/> (the same `_tag`-based union shape; atom's `Result` is documented in the atom-react README)
- Better Auth React client: <https://www.better-auth.com/docs/concepts/client>
- Better Auth — sign in with social: <https://www.better-auth.com/docs/authentication/social-sign-in>
- TanStack Router pathless layouts: <https://tanstack.com/router/latest/docs/framework/react/guide/route-trees#pathless-layout-routes>

## Sections

1. **Backend walk-through:** [`backend-walkthrough.md`](./backend-walkthrough.md) — short. No new backend code; this just confirms what's already there and notes the cookie-through-Vite-proxy path.
2. [Set up the runtime and the `meAtom`](./exercises/01-runtime-and-atoms.md) — `runtime.ts`, `atoms/auth.ts`. The chapter's foundational exercise; everything else reads from `meAtom`.
3. [Build the login page](./exercises/02-login-page.md) — the Better Auth React client, the `/login` route, the "Sign in with GitHub" button.
4. [The `_authed` gate](./exercises/03-route-gating.md) — pathless layout, component-level redirect, moving the smoke-test home page under the gate.
5. [Logout](./exercises/04-logout.md) — `logoutFn` atom, button, refresh `meAtom` so the gate kicks in immediately.

> **Optional first step (one-time setup): a GitHub OAuth app.** Chapter 2 made the backend ready for OAuth, but you may not have actually completed a sign-in yet. If `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` aren't in your `.env`, see [`exercises/00-github-oauth-app.md`](./exercises/00-github-oauth-app.md) before starting Section 2.
