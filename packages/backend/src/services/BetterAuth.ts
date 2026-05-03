// packages/backend/src/services/BetterAuth.ts
//
// THE BETTER AUTH EFFECT SERVICE.
// ============================================================================
// Better Auth is Promise-based; this file is the *only* place we cross that
// seam. We expose two methods to the rest of the app — `handler` (so we can
// mount Better Auth's web handler under `/api/auth/*`) and `getSession` (so
// the Authentication middleware can resolve a request to a user).
//
// CONTRAST WITH CHAPTER 1
// ----------------------------------------------------------------------------
// The `Db` service got to lean on `@effect/sql-drizzle`'s module augmentation:
// every Drizzle query is *also* an Effect, no wrapper needed. Better Auth has
// no such helper, so we wrap each call in `Effect.tryPromise({ try, catch })`
// and map exceptions to a typed `BetterAuthError`.
//
// This is the canonical pattern for bringing any Promise-based library into
// the Effect graph. You'll do it again for Octokit in Phase 5.
//
// TAGGED ERROR CHOICE
// ----------------------------------------------------------------------------
// `BetterAuthError` is a *boundary* error — it represents "the underlying
// library threw something we didn't expect" (network blip, schema mismatch).
// It never crosses the wire because the middleware in `services/Auth.ts`
// catches it and emits `Unauthorized` (or, eventually, a generic `Internal`)
// to the client.
//
// Boundary errors that don't cross the wire → `Data.TaggedError`.
// API contract errors that *do* cross the wire → `Schema.TaggedError`
//   (those live in `packages/shared/src/errors.ts`).
//
// SHAPE OF THE SERVICE
// ----------------------------------------------------------------------------
//   export class BetterAuth extends Context.Tag("BetterAuth")<
//     BetterAuth,
//     {
//       readonly handler: (request: Request) => Effect.Effect<Response, BetterAuthError>
//       readonly getSession: (
//         headers: Headers
//       ) => Effect.Effect<{ user: User; session: Session } | null, BetterAuthError>
//     }
//   >() {}
//
// Why `null` instead of `Option`? Better Auth itself returns `null` for
// "no valid session"; mirroring that shape keeps the wrapper shallow. The
// middleware will pattern-match and decide whether to fail with `Unauthorized`.
//
// CONSTRUCTING THE LAYER
// ----------------------------------------------------------------------------
// Use `Layer.effect` — the service has no resource lifecycle of its own. The
// effect just builds the wrapped object:
//
//   export const BetterAuthLive = Layer.effect(
//     BetterAuth,
//     Effect.sync(() => BetterAuth.of({
//       handler: (request) =>
//         Effect.tryPromise({
//           try: () => auth.handler(request),
//           catch: (cause) => new BetterAuthError({ cause })
//         }),
//       getSession: (headers) =>
//         Effect.tryPromise({
//           try: () => auth.api.getSession({ headers }),
//           catch: (cause) => new BetterAuthError({ cause })
//         })
//     }))
//   )
//
// `Effect.sync` here is just a convenient way to lift a synchronous "build
// the object" into an effect. There's no async work in the constructor; if
// there were (e.g. an initial token fetch), you'd use `Effect.gen` instead.
//
// WHY EXPOSE ONLY TWO METHODS?
// ----------------------------------------------------------------------------
// Better Auth's `auth.api` namespace is large (signInEmail, signOut,
// listSessions, revokeSession, ...). Most of those are reached via the HTTP
// surface — the frontend hits `/api/auth/sign-out`, Better Auth's handler
// responds, no server-side code involved.
//
// Keep the service surface narrow. Add methods only when a server-side
// caller actually needs them. The narrow surface is also what tests will
// stub via `Layer.succeed(BetterAuth, fakeImpl)`.

import { Context, Data, Effect, Layer } from "effect"
import { drizzle } from "drizzle-orm/node-postgres"
import { and, eq } from "drizzle-orm"
import { auth } from "../auth"
import type { Session, User } from "../auth"
import { account } from "../db/schema"

class BetterAuthError extends Data.TaggedError("BetterAuthError")<{
  readonly cause: unknown
}> {}
export type { BetterAuthError } // exported as a type for the middleware to catch

// Boundary error: user has no GitHub account row, or the row has no token.
// The Auth service maps this to `GitHubTokenExpired` for the wire.
export class NoGithubToken extends Data.TaggedError("NoGithubToken")<{}> {}

export class BetterAuth extends Context.Tag("BetterAuth")<
  BetterAuth,
  {
    readonly handler: (
      request: Request
    ) => Effect.Effect<Response, BetterAuthError>
    readonly getSession: (
      headers: Headers
    ) => Effect.Effect<{ user: User; session: Session } | null, BetterAuthError>
    // GitHub OAuth token, read straight from the `account` table that Better
    // Auth populates on sign-in. We don't try to refresh — if GitHub later
    // returns 401, the GitHub service maps that to `GitHubTokenExpired` and
    // the UI prompts a reconnect.
    readonly getGithubAccessToken: (
      userId: string
    ) => Effect.Effect<string, NoGithubToken | BetterAuthError>
  }
>() {}

export const BetterAuthLive = Layer.effect(
  BetterAuth,
  Effect.sync(() => {
    // Same lightweight Drizzle client pattern as `auth.ts`. Better Auth's
    // own queries use a separate pool on the same DATABASE_URL; one extra
    // shallow connection here is fine and keeps this service self-contained.
    const db = drizzle(process.env.DATABASE_URL!)

    return BetterAuth.of({
      handler: (request) =>
        Effect.tryPromise({
          try: () => auth.handler(request),
          catch: (cause) => new BetterAuthError({ cause })
        }),
      getSession: (headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: (cause) => new BetterAuthError({ cause })
        }),
      getGithubAccessToken: (userId) =>
        Effect.gen(function*() {
          const rows = yield* Effect.tryPromise({
            try: () =>
              db
                .select({ token: account.accessToken })
                .from(account)
                .where(
                  and(
                    eq(account.userId, userId),
                    eq(account.providerId, "github")
                  )
                )
                .limit(1),
            catch: (cause) => new BetterAuthError({ cause })
          })
          const token = rows[0]?.token
          if (!token) return yield* Effect.fail(new NoGithubToken())
          return token
        })
    })
  })
)
