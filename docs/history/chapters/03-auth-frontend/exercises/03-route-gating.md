# 03 — The `_authed` gate and moving the home page

## Goal

Build the pathless `_authed` layout that gates every authenticated route, and move the smoke-test home page under it so `/` requires a session.

## Concepts practiced

- TanStack Router pathless layouts as folders (`_authed/route.tsx`).
- Route groups (`(public)/`) for organizing public routes without affecting URL.
- Component-level route gating with `Result.match`.
- The `Outlet` slot for nested routing.

## File layout we're heading toward

```
packages/frontend/src/routes/
  __root.tsx
  (public)/
    login.tsx          → /login        (route group; parens = no URL segment)
  _authed/
    route.tsx          → layout/gate   (underscore folder = pathless layout)
    index.tsx          → /             (lives under the gate)
```

Two TanStack conventions doing the work:

- **`(public)/` — route group.** Parentheses around a folder name organize routes without adding a URL segment and without expecting a layout file. It's pure folder organization.
- **`_authed/route.tsx` — pathless layout.** Underscore-prefixed folder is a pathless layout group; `route.tsx` inside is the layout component.

## Files you'll touch

- `packages/frontend/src/routes/_authed/route.tsx` — already moved/stubbed for you.
- `packages/frontend/src/routes/index.tsx` → `packages/frontend/src/routes/_authed/index.tsx` — you do the rename.

## Steps

### 1. Fill in the gate

Open `packages/frontend/src/routes/_authed/route.tsx`. The file's comment block has the full shape. Three things to write:

1. The imports. Use the `@/` alias (`@/atoms/auth`) — the same string regardless of file depth.
2. `export const Route = createFileRoute("/_authed")(...)` — the layout's route ID is just `/_authed` (no trailing slash; that's the index, not the layout).
3. `AuthedLayout`, which renders one of:
   - `<p>Loading…</p>` on `Initial`,
   - `<Outlet />` on `Success`,
   - `<Navigate to="/login" replace />` on `Failure`.

Plain `Result.match` is fine here — the failure shape doesn't matter, every failure means "send to login".

### 2. Move the home under the gate

Move:

```
packages/frontend/src/routes/index.tsx  →  packages/frontend/src/routes/_authed/index.tsx
```

(Just `mv`; the file's contents stay the same except for the route declaration.)

Update the route declaration inside the moved file:

```ts
// before
export const Route = createFileRoute("/")({ component: Home })

// after
export const Route = createFileRoute("/_authed/")({ component: Home })
```

The trailing slash matters — `/_authed/` is the index of the `_authed` group; `/_authed` is the layout itself.

The URL the user sees is still `/`. `_authed` is pathless.

Imports inside `Home` already use the `@/` alias (`@/services/ApiClient`, `@/atoms/auth`), so they don't change with the move — that's the point of the alias.

Save. The TanStack plugin will regenerate `routeTree.gen.ts`. If you get a TS error about the path string, it'll tell you exactly what to use — copy that.

### 3. Verify

With the backend running and the dev server up:

- **Signed out:** open `http://localhost:5173/` in an incognito window. After a brief "Loading…" you're redirected to `/login`.
- **Signed in:** sign in via `/login`, land on `/`, see your user JSON. Refresh the page — same result, no flash to `/login`.
- **Mid-session "logout":** in DevTools → Application → Cookies, delete the Better Auth session cookie. Refresh `/`. You should be bounced to `/login`.
- **Login page while signed in:** navigating to `/login` redirects to `/` (this works because of Section 02's `Result.isSuccess` check).

## Acceptance criteria

- [ ] `routes/_authed/route.tsx` exists and exports a `Route`.
- [ ] `routes/index.tsx` is gone; `routes/_authed/index.tsx` is the home page.
- [ ] Hitting `/` while signed out redirects to `/login` with no flash of authenticated content.
- [ ] Hitting `/` while signed in renders the home.
- [ ] Refreshing the home doesn't re-fire `/me` more than once (the atom's cache is doing its job).

## Hints

- The router-plugin treats `(folder)/` as pure organization — no layout file, no `/(folder)/` segment in the URL. The route ID it generates IS `/(folder)/page` though, which is what `createFileRoute` expects.
- If `routes/_authed/route.tsx` AND a flat `routes/_authed.tsx` both existed, the plugin would error on the conflict. We only have the folder form.
- If the gate flickers between Loading and Outlet on every navigation, the atom is being invalidated somewhere it shouldn't be. Make sure no other code is `get.refresh(meAtom)`-ing on mount.
- `<Navigate to="/login" replace />` uses `replace` so the failed-auth URL doesn't end up in browser history.
- If the `Outlet` renders nothing, you likely forgot the rename or the new file's `createFileRoute` argument is wrong (so the home isn't actually a child of the gate).
