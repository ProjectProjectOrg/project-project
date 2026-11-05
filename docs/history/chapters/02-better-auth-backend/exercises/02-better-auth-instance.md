# Exercise 2 — The Better Auth instance

**File to edit:** `packages/backend/src/auth.ts`

## Goal

Promote the bare-minimum `auth.ts` from Exercise 1 into the real, configured Better Auth instance the rest of the app will use. This file owns the configuration; nothing in it is Effect-flavored yet — that's Exercise 3.

## Concepts practiced

- Configuring Better Auth's GitHub provider with the right scopes for "we'll need the GitHub token later".
- Using `Config`-style env reads vs `process.env` reads in non-Effect code (it's fine to use `process.env` here — this file boots before any Effect runtime, and Better Auth wants plain strings).
- Sharing a Drizzle client between Better Auth (Promise-based) and the `Db` Effect service (Effect-based) without instantiating two pools.

## Steps

1. Re-read the comment block at the top of `packages/backend/src/auth.ts`. It walks through the trade-off about the Drizzle client.

2. Decide how Better Auth gets its Drizzle client. Two acceptable approaches:
   - **(Simple, recommended for this chapter)** A second `drizzle()` instantiation just for Better Auth, sharing the same `DATABASE_URL`. Two pools, both small. Costs a handful of extra connections; saves you from threading the Effect runtime into module-load code.
   - **(Advanced)** Build the Drizzle client once (e.g. in a separate `db.ts` module that exports a singleton), and have both `auth.ts` and `services/Db.ts` consume it. The Effect layer then becomes `Layer.succeed(Db, sharedDb)`. This works but couples `Db` to a non-Effect lifecycle, defeating part of why we made it a Layer.

   Go with the simple option; revisit if it bites.

3. Fill in the configuration:
   - `database`: `drizzleAdapter(db, { provider: "pg" })`. If you generated the auth schema into `auth-schema.ts`, also pass `schema: { user, session, account, verification }` so the adapter targets _your_ tables (some Better Auth versions need this to find non-default table names).
   - `secret`: `process.env.BETTER_AUTH_SECRET` (let it throw if missing — boot-time misconfig should be loud).
   - `baseURL`: `process.env.BETTER_AUTH_URL` — used for OAuth callback construction.
   - `socialProviders.github`: `clientId`, `clientSecret`, and `scope: ["read:user", "user:email", "repo"]`. The `repo` scope is what gives us push access to create branches in Phase 5.
   - `session`: `{ cookieCache: { enabled: true, maxAge: 5 * 60 } }` — caches session lookups for 5 minutes to avoid hitting the DB on every request.

4. Export `auth` and also re-export the `User` type from Better Auth: `export type User = typeof auth.$Infer.Session["user"]`. Better Auth derives the user type from your config (it changes if you enable email/password, etc.), so we use the inferred type rather than a hand-written one.

5. Run `bun run --filter @projectproject/backend typecheck`. It should still pass — nothing imports `auth.ts` yet.

6. Sanity-test by booting Better Auth's CLI dry-run if you like (optional):
   ```
   bunx @better-auth/cli generate --config ./packages/backend/src/auth.ts --output ./tmp.ts
   ```
   The CLI should run without complaining; you can delete `tmp.ts` after.

## Acceptance criteria

- [ ] `auth.ts` exports a configured `auth` and a `User` type alias derived from `auth.$Infer.Session["user"]`.
- [ ] GitHub scopes include `repo`, `read:user`, `user:email`.
- [ ] No file outside `auth.ts` imports `better-auth` directly. (Exercise 3 will add `services/BetterAuth.ts` as the only other consumer.)
- [ ] Typecheck passes.

## Hints

<details>
<summary>Hint 1 — why <code>$Infer.Session["user"]</code>?</summary>

Better Auth's user shape is _not fixed_. If you enable email/password auth, additional fields appear (`emailVerified`, `password`-related). If you add custom fields via `additionalFields`, they show up on `user`. Hand-writing `interface User { id: string; email: string; ... }` will drift the moment you enable a feature.

`auth.$Infer.Session["user"]` is the type Better Auth itself uses internally, derived from your config. It will always match what `auth.api.getSession` returns.

</details>

<details>
<summary>Hint 2 — what does <code>cookieCache</code> actually do?</summary>

By default, every server-side `getSession({ headers })` call queries the `session` table to validate the cookie. With `cookieCache.enabled = true`, Better Auth stores a signed snapshot of the session in the cookie itself; for `maxAge` seconds after the snapshot was written, `getSession` reads from the snapshot instead of hitting the DB.

For a learning project this is mostly invisible. For production it matters — without it, every authenticated request is a DB query. The trade-off: a session revoked in the DB is still trusted for up to `maxAge` seconds in the cache window. Five minutes is a reasonable default.

</details>

<details>
<summary>Hint 3 — what about <code>trustedOrigins</code>?</summary>

In dev (frontend on `:5173`, backend on `:3000`) you'll want `trustedOrigins: ["http://localhost:5173", "http://localhost:3000"]`. In production both apps live behind one origin so the array is redundant. Add it now to save yourself a debugging hour later.

</details>
