# Chapter 2 — Auth: Better Auth + the typed `/me` contract

## What this chapter teaches

By the end of this chapter you will have:

- Better Auth's tables (`user`, `session`, `account`, `verification`) generated and migrated into Postgres.
- A configured Better Auth instance with GitHub OAuth, mounted at `/api/auth/*` next to the existing HttpApi at `/api/*`.
- An Effect service wrapping Better Auth, an `Authentication` middleware on the API, and a typed `GET /me` endpoint that returns the current user or fails with `Unauthorized`.

The point isn't "we have login working". The point is the **patterns** this chapter uses, which generalize to most things you'll do later:

- Wrapping a Promise-based library as an Effect service (`Effect.tryPromise` + `Layer.effect`) — applies to Octokit, Lexical, gray-matter, and most npm libraries.
- The shared/backend split for typed contracts: declare the contract once in `shared/`, implement it in `backend/`, consume it from `frontend/`.
- `Schema.TaggedError` for over-the-wire errors, `Data.TaggedError` for internal-only ones — the central distinction whenever you create a new error class.
- HttpApi middleware as typed dependency injection: the handler doesn't read cookies, it yields `CurrentUser` and trusts the framework.

## Concepts

The **backend walk-through** explains the Effect-on-the-backend concepts in context (`Layer.effect`, `Effect.tryPromise`, error-channel-must-be-`never`, the router middleware seam). Read it after the implementation work is done.

What's worth pulling forward into your own writing:

### `Schema.TaggedError` vs `Data.TaggedError`

There are two ways to declare a tagged error in Effect, and the choice matters for every new error you add:

- **`Schema.TaggedError`** — has an underlying Schema. Encodes/decodes across the wire. Required for any error referenced by `addError(...)` on an `HttpApiEndpoint`. Lives in `packages/shared/src/errors.ts`.
- **`Data.TaggedError`** — plain class with structural equality. No Schema. Used for boundary errors that get caught and translated before they reach the wire. Lives next to the code that throws them, often in `packages/backend/src/services/*.ts`.

In this chapter: `Unauthorized` (in shared) is `Schema.TaggedError`; `BetterAuthError` (in backend) is `Data.TaggedError`. The middleware translates the latter into the former before any client sees it.

### HttpApi middleware as DI

A handler that needs the current user shouldn't read cookies itself. It should declare "I need a user" in its dependencies and have the framework inject one. `@effect/platform`'s mechanism is `HttpApiSecurity` (declares where to look for the auth token) + `HttpApiMiddleware` (the typed middleware Tag) + a Live Layer (the implementation).

You'll see this pattern again in every chapter that adds gated endpoints — projects, tickets, members. The middleware never changes; only the underlying Layer might (e.g. for tests, swap the live one for `Layer.succeed(Authentication, fakeImpl)`).

### The shared package's role

The shared package is the typed seam. The HttpApi definition, the schemas, the tagged errors — all the things both ends need to agree on type-wise — live there. When you write `client.auth.me()` on the frontend in a future chapter, it'll be type-checked against the same `User` schema and `Unauthorized` error you wrote in the contract exercise here.

This is the most leveraged 30 lines of TypeScript in the repo.

## Further reading

- Better Auth — installation: <https://www.better-auth.com/docs/installation>
- Better Auth — Drizzle adapter: <https://www.better-auth.com/docs/adapters/drizzle>
- Better Auth — GitHub provider: <https://www.better-auth.com/docs/authentication/github>
- Effect HttpApi — middleware & security: <https://effect.website/docs/platform/http-api/#middleware>
- `Schema.TaggedError` (vs `Data.TaggedError`): <https://effect.website/docs/error-management/yieldable-errors/>
- `Effect.tryPromise` reference: <https://effect.website/docs/error-management/expected-errors/#trypromise>

## Sections

1. [Auth tables and migration](./exercises/01-auth-tables.md) — generate Better Auth's Drizzle schema and apply it.
2. [The Better Auth instance](./exercises/02-better-auth-instance.md) — configure Better Auth with GitHub + the Drizzle adapter.
3. **Backend walk-through:** [`backend-walkthrough.md`](./backend-walkthrough.md) — what's in `services/BetterAuth.ts`, `services/Auth.ts`, `handlers/auth.ts`, and the routing wiring in `main.ts`. Read this before doing the contract exercise; it explains what your shared exports are plugging into.
4. [The shared auth contract](./exercises/03-shared-contract.md) — write `Unauthorized`, `User`, `CurrentUser`, the `Authentication` middleware tag, and the `auth` group on `AppApi`. After this, the backend typechecks and `/me` is reachable end-to-end.

> **Note on the new structure.** Starting in this chapter the project is split: backend implementation is mine (you read the walk-through), shared and frontend are yours (exercises). See the project `CLAUDE.md` for the full new contract. Chapter 3 onward will follow this shape, with frontend exercises as the chapter's center of gravity.
