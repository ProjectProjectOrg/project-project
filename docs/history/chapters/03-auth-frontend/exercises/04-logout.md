# 04 — Logout

## Goal

Add a `logoutAtom` that calls Better Auth's `signOut()` and refreshes `meAtom`, plus a button in the home page that triggers it. After click: cookie cleared, `meAtom` re-runs, `_authed` gate redirects to `/login`.

## Concepts practiced

- `runtime.fn` for one-shot mutations.
- `Effect.fn` with the `(input, get)` signature.
- `get.refresh(otherAtom)` as cache invalidation.
- The full atom-driven lifecycle: mutation → invalidate → re-fetch → gate reacts.

## Files you'll touch

- `packages/frontend/src/atoms/auth.ts` — fill in `logoutAtom`.
- `packages/frontend/src/routes/_authed/index.tsx` — add a logout button.

## Steps

### 1. Fill in `logoutAtom`

Open `packages/frontend/src/atoms/auth.ts`. The comment block in that file has the shape. The body is:

```ts
yield * Effect.tryPromise(() => authClient.signOut())
get.refresh(meAtom)
```

Two things to internalize:

- `Effect.tryPromise` lifts a promise-returning function into Effect, capturing rejections in the `E` channel as `UnknownException`. This is the standard wrapper for any third-party promise call.
- `get.refresh(meAtom)` invalidates `meAtom`'s cached `Result`. Any component reading `meAtom` will receive `Initial` momentarily and the Effect re-runs. After logout, that re-run hits `/me`, gets `Unauthorized`, and the gate redirects.

### 2. Add the button

In `routes/_authed/index.tsx` (the renamed home page), add a logout button:

```tsx
import { useAtomSet } from "@effect-atom/atom-react"
import { logoutAtom } from "../atoms/auth"

// inside the component:
const logout = useAtomSet(logoutAtom)

// in JSX:
<button onClick={() => logout()}>Sign out</button>
```

You can keep this in the existing "Auth" section of the smoke-test page. Don't bother with confirmation modals or styling.

### 3. Verify

- Sign in, land on `/`.
- Click "Sign out".
- You should be redirected to `/login` after a brief moment (the time it takes Better Auth to clear the cookie + `/me` to re-fire).
- The Network tab should show: POST `/api/auth/sign-out` → GET `/api/me` (returns 401) → URL changes to `/login`.
- Hard-refresh `/login`. You should _stay_ on `/login` — the cookie is gone.

## Acceptance criteria

- [ ] `logoutAtom` calls `signOut()` and refreshes `meAtom`.
- [ ] Clicking the button signs out and redirects to `/login` without a manual refresh.
- [ ] No "ghost" authenticated UI flashes after the click — the refresh + redirect is fast enough that the user goes straight from "Sign out" to the login page.

## Hints

- `useAtomSet` returns a callable; you invoke it with the input the atom expects (here, `void`).
- If clicking the button does nothing, check that `logoutAtom` is exported and that you're calling the _return value_ of `useAtomSet`, not `useAtomSet` itself.
- If the redirect doesn't happen but the cookie is cleared (verify in DevTools), `get.refresh(meAtom)` is missing — without it, `meAtom`'s old `Success` result is still cached and the gate stays open.
- If you see `/me` fire many times after logout, you've likely got two components both refreshing the atom. The cleanest setup has the refresh happen exactly once, inside `logoutAtom`.

## Stretch (optional)

- Wire a "Sign out" link into a tiny header component and put it in `_authed.tsx` so it shows on every authenticated page. The atoms are already shared — the same `useAtomSet(logoutAtom)` works in any component.
- Add a `meSuspenseAtom` variant that uses `runtime.atom` with `Atom.runtime.suspense` (if you're curious about React Suspense interop). Skip if the chapter has been long enough already.
