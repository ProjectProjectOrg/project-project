# Exercise 3 — The shared auth contract

**Files to edit:**

- `packages/shared/src/errors.ts`
- `packages/shared/src/schemas/User.ts`
- `packages/shared/src/Authentication.ts`
- `packages/shared/src/api.ts`
- `packages/shared/src/index.ts`

## Goal

Write the `shared` package additions that make the backend (already implemented) typecheck and serve `/me`. Five exports to add:

- `Unauthorized` — `Schema.TaggedError`, mapped to HTTP 401.
- `User` — `Schema.Struct` matching the Better Auth user shape we expose to clients.
- `CurrentUser` — `Context.Tag` whose value is `User`. The middleware injects this; handlers read it.
- `Authentication` — `HttpApiMiddleware.Tag` declaring the cookie security scheme, `provides: CurrentUser`, `failure: Unauthorized`.
- An `auth` group on `AppApi` with one endpoint: `GET /me`. Decorated with `.middleware(Authentication)`.

## Concepts practiced

- `Schema.TaggedError` for over-the-wire errors — the difference vs `Data.TaggedError`, which lives in backend-only boundary code.
- `HttpApiSchema.annotations({ status: 401 })` to bind an error class to an HTTP status code.
- `HttpApiSecurity.apiKey({ in: "cookie", key })` — declarative security schemes that surface in the OpenAPI doc and feed the middleware framework.
- `HttpApiMiddleware.Tag<Self>()(name, { provides, security, failure })` — the contract side of typed middleware. The `Live` Layer (`backend/src/services/Auth.ts`) implements it; this side just declares what the middleware looks like to consumers.
- `Context.Tag` for `CurrentUser` — the value the middleware injects, yielded by handlers via `yield* CurrentUser`.
- Adding a new group to an existing `HttpApi` and decorating it with `.middleware(...)`.

## Steps

### 1. `errors.ts` — `Unauthorized`

Open `packages/shared/src/errors.ts`. The stub there explains the wire-vs-internal divide.

Declare `Unauthorized` as a `Schema.TaggedError`. Two ways to bind the 401 status:

- The simplest: pass a third "annotations" argument to `Schema.TaggedError` containing `HttpApiSchema.annotations({ status: 401 })`. Some `@effect/platform` versions expose this via the `Schema.annotations` helper instead — the type error will tell you which pattern your version expects.
- A fallback: declare the class without annotations, then call `HttpApiSchema.withAnnotations(Unauthorized, { status: 401 })` and export the result.

The error has no fields — `Unauthorized` is enough information for the client.

### 2. `schemas/User.ts` — `User`

Open `packages/shared/src/schemas/User.ts`. Declare `User` as a `Schema.Struct` with these fields:

- `id: Schema.String`
- `email: Schema.String`
- `name: Schema.String`
- `image: Schema.NullOr(Schema.String)`
- `createdAt: Schema.Date`

Export both the runtime `User` constant and the type alias `type User = typeof User.Type`. The runtime constant is what `addSuccess(User)` and `addError(...)` reference; the type alias is for handler/atom code that reads `User` values.

`Schema.Date` decodes from ISO string on the wire to a `Date` object in code. The backend hands `getSession(...)`'s result back through the typed pipeline, which encodes the JS `Date` via this schema on its way out. No manual JSON dance.

### 3. `Authentication.ts` — `CurrentUser` + the middleware tag

Open `packages/shared/src/Authentication.ts`. Three declarations:

```ts
export class CurrentUser extends Context.Tag("CurrentUser")<
  CurrentUser,
  User
>() {}

const sessionCookie = HttpApiSecurity.apiKey({
  in: "cookie",
  key: "better-auth.session_token"
})

export class Authentication extends HttpApiMiddleware.Tag<Authentication>()(
  "Authentication",
  {
    provides: CurrentUser,
    security: { sessionCookie },
    failure: Unauthorized
  }
) {}
```

Things to double-check while you write this:

- The `key` in `HttpApiSecurity.apiKey` must match the cookie Better Auth actually sets. In dev, that's `better-auth.session_token`. After step 5 you'll be able to inspect the real cookie in devtools — if the prefix has changed, update it here.
- Don't export `sessionCookie` — it's only referenced inside the `Authentication` declaration. Leaving it module-local keeps the exported surface clean.
- The class-with-static-call pattern (`extends HttpApiMiddleware.Tag<Self>()(name, options)`) is unusual; that's how `@effect/platform` registers the type identity for middleware. Don't fight it; the pattern matches `HttpApiGroup.make` and `Schema.TaggedError`.

### 4. `api.ts` — the `auth` group

Open `packages/shared/src/api.ts`. Add a new `auth` group with one endpoint, then add it to `AppApi`:

```ts
const Auth = HttpApiGroup
  .make("auth")
  .add(
    HttpApiEndpoint
      .get("me", "/me")
      .addSuccess(User)
      .addError(Unauthorized)
  )
  .middleware(Authentication)

const AppApi = HttpApi
  .make("projectproject")
  .add(HealthGroup)
  .add(DbGroup)
  .add(Auth)
```

A few small notes:

- The endpoint is `"me"` (its identifier within the group) at path `/me`. The full URL ends up `/api/me` because Better Auth and HttpApi are mounted siblings under `/api/*` (see the [walk-through](../backend-walkthrough.md)).
- `.middleware(Authentication)` decorates the group — every endpoint in it inherits the middleware. Add more endpoints to this group later (logout, etc.) and they're auth-gated automatically.
- `addError(Unauthorized)` must be present on every endpoint that goes through the middleware. The framework knows from the middleware declaration that the failure is `Unauthorized`, but each endpoint still has to surface it in its own error union for the client's typed pipeline.

### 5. `index.ts` — re-export

Open `packages/shared/src/index.ts`. Uncomment / add the three re-exports for the new modules. Order doesn't matter.

### 6. Verify

```
bun run --filter @projectproject/shared typecheck
bun run --filter @projectproject/backend typecheck
```

Both should now pass. Then:

```
bun run dev:backend
```

Walk through the smoke test. **Make sure the frontend dev server (`bun run dev:frontend`) is also running** — we go through it on port 5173 so the OAuth cookie lands on the same origin the SPA will eventually use.

```
# 1. No cookie — expect 401.
curl -i http://localhost:5173/api/me

# 2. Initiate the GitHub sign-in. Better Auth's social-sign-in route is
#    POST /api/auth/sign-in/social — it does NOT issue a 302; it returns
#    JSON containing the GitHub authorize URL. Normally the Better Auth
#    client SDK reads that URL and navigates the browser to it; for this
#    smoke test we do that step by hand.
curl -i -X POST http://localhost:5173/api/auth/sign-in/social \
  -H "Content-Type: application/json" \
  -d '{"provider":"github","callbackURL":"http://localhost:5173/"}'
# → 200 OK
# → { "url": "https://github.com/login/oauth/authorize?client_id=...", "redirect": true }

# 3. Copy the `url` value from that response and open it in the browser.
#    Click through GitHub consent. GitHub redirects to
#    http://localhost:5173/api/auth/callback/github?code=..., Vite proxies
#    that to the backend, Better Auth exchanges the code, sets the cookie,
#    then redirects to `callbackURL`. You'll land on a 404 page (the SPA
#    has no "/" route yet); that's fine.

# 4. In devtools → Application → Cookies → http://localhost:5173, you
#    should see `better-auth.session_token`. Copy its value, then:
curl -i -H "Cookie: better-auth.session_token=<paste>" http://localhost:5173/api/me
# → 200 OK
# → {"id": "...", "email": "...", "name": "...", "image": "...", "createdAt": "2026-..."}
```

Two things that can go wrong here, with the diagnostics that distinguish them:

- **Step 4 returns 401 even with a freshly-set cookie.** Check the cookie name in devtools. If it's `__Secure-better-auth.session_token` or similar, update the `key` in `HttpApiSecurity.apiKey` in `Authentication.ts` to match.
- **Step 3 cookie shows up under origin `:3000` instead of `:5173`.** Means `BETTER_AUTH_URL` is still pointing at `:3000`. The cookie has to be set on the user-facing origin, which is `:5173` in dev. Restart the backend after fixing `.env`.

## Acceptance criteria

- [ ] `Unauthorized` is exported from `@projectproject/shared`, is a `Schema.TaggedError`, and produces HTTP 401 on the wire.
- [ ] `User` is a `Schema.Struct` with the five fields above; both the runtime constant and the type alias are exported.
- [ ] `CurrentUser` is a `Context.Tag<CurrentUser, User>` exported from shared.
- [ ] `Authentication` is an `HttpApiMiddleware.Tag` declaring the cookie security scheme, `provides: CurrentUser`, `failure: Unauthorized`.
- [ ] `AppApi` includes an `auth` group with `GET /me` returning `User` or `Unauthorized`, decorated with `.middleware(Authentication)`.
- [ ] Both typechecks pass.
- [ ] `curl /api/me` returns 401 without the cookie and 200 with it.

## Hints

<details>
<summary>Hint 1 — why does <code>Schema.TaggedError</code> need to know the status code?</summary>

The HTTP layer has to translate every `Effect` failure into a response with a status code, headers, and a body. `addError(Unauthorized)` tells `HttpApiBuilder` "this endpoint can fail with this class" — but the framework still has to decide how to encode it.

For a Schema-backed error, the body is `JSON.stringify(error)` (using the schema's encoder). The status comes from `HttpApiSchema.annotations({ status: 401 })` attached to the class.

Without the annotation, the framework defaults to 500, which is wrong for an auth failure: the client should pattern-match on 401 to know "I need to log in" vs "the server is broken".

</details>

<details>
<summary>Hint 2 — why does <code>Authentication</code> live here and not in <code>backend/src/services/Auth.ts</code>?</summary>

The Tag is the contract — `api.ts` references it (`.middleware(Authentication)`) and the backend's Live Layer references it (`Layer.effect(Authentication, ...)`). Both ends need the same Tag identity, so it lives in the package both ends import.

The Live Layer can't live in `shared/` because it depends on the `BetterAuth` service, which is backend-only. So we split:

- `shared/Authentication.ts` — Tag declaration. Pure type / metadata, no runtime logic.
- `backend/services/Auth.ts` — `Layer.effect(Authentication, ...)`. Implements what the Tag declared.

This is the same pattern HttpApi uses for the API definition itself: `AppApi` lives in shared; handlers (`HealthHandlerLive`, `AuthHandlerLive`, etc.) live in backend.

</details>

<details>
<summary>Hint 3 — what does <code>provides: CurrentUser</code> actually do?</summary>

When a request comes in for an endpoint in a group decorated with `.middleware(Authentication)`:

1. The framework parses the cookie according to the security scheme.
2. It calls the Live Layer's implementation function (the one in `backend/services/Auth.ts`), passing the cookie value.
3. If that Effect succeeds, the framework adds the resulting value to the per-request Effect context under the `CurrentUser` Tag.
4. The handler runs with that context already populated. `yield* CurrentUser` resolves the value.

If the Effect fails with `Unauthorized`, the framework translates it to a 401 response and never calls the handler.

So `provides: CurrentUser` is the framework promising "I'll put a value of this Tag's type into the context before your handler runs." Removing the decoration on the group means that promise is no longer made, and `yield* CurrentUser` becomes a type error in the handler.

</details>
