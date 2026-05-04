# Chapter 3 — Backend walk-through

## What I built

Nothing this chapter. Read on to find out why that's interesting.

## Why there's no new backend code

Chapter 2 closed with the full auth backend in place:

- Better Auth mounted at `/api/auth/*` — handles `sign-in/social`, `callback/github`, `sign-out`, and reading the session cookie.
- The typed `GET /api/me` endpoint — gated by the `Authentication` middleware that reads the cookie and yields `CurrentUser`.
- The shared contract — `Unauthorized` as a `Schema.TaggedError`, `User` schema, the `Authentication` middleware tag.

Everything Chapter 3 needs already exists on the wire. The frontend's job is to _use_ it: drive the Better Auth `/api/auth/*` endpoints for sign-in/sign-out, and call `/api/me` through `HttpApiClient.make(AppApi)`.

This is the chapter where the Chapter 2 pattern earns its keep. The contract is in `packages/shared`; backend implements it; frontend consumes the same definition. Adding a new endpoint on the backend will eventually need a frontend change to use it — but the type system tells you that, and `HttpApiClient.make(AppApi)` re-derives a client that already knows about it. No regenerated SDK, no out-of-sync clients.

## The seam to keep in mind

The cookie path is the only thing worth re-reading once:

1. Browser hits `http://localhost:5173` (Vite dev server).
2. The login page calls `signIn.social({ provider: "github" })` from the Better Auth React client. That posts to `/api/auth/sign-in/social` against the Vite origin.
3. Vite's dev proxy (configured in `packages/frontend/vite.config.ts`) forwards `/api` requests to `http://localhost:3000` _without rewriting the path or changing cookies_. The `Set-Cookie` headers Better Auth returns are observed by the browser as if they came from `localhost:5173` — which is fine because dev cookies aren't `Secure`, and Better Auth's `trustedOrigins` (configured back in Chapter 2) includes both ports.
4. After the OAuth round-trip, the browser holds a Better Auth session cookie scoped to its current origin.
5. Every subsequent `client.auth.me()` call from the frontend goes through the proxy with the cookie attached. The backend's `Authentication` middleware reads it via `BetterAuth.getSession`, attaches `CurrentUser` to the Effect context, and the handler returns the user.

If sign-in works but `/me` keeps returning `Unauthorized`, the cookie path is the first thing to suspect — typically a `BETTER_AUTH_URL` mismatch or a `trustedOrigins` typo.

## The Effect ideas earning their keep here

**Once.** The contract is defined once, in `packages/shared`. We are not writing types twice. The `Unauthorized` you'll pattern-match on in `_authed.tsx` is the same class your handler can throw; the schema describes both its on-the-wire shape and its runtime structure. This is the single most leveraged property of the typed-contract design — and you'll feel it most acutely once you have a frontend that consumes 5+ endpoints.

## Things to watch out for

- **Don't import `auth` directly from the frontend.** `packages/backend/src/auth.ts` exports the Better Auth instance; that's a backend-only object (it constructs a Drizzle client at module load). The frontend uses `createAuthClient` from `better-auth/react`, which is a separate, browser-safe export. Never reach across the package boundary into backend's `auth.ts`.
- **The two `User` types.** Better Auth's `User` (inferred from `auth.$Infer.Session["user"]`) is the _server-side_ shape. The `User` in `@projectproject/shared/schemas` is the _wire_ shape — what the API hands back. They overlap but aren't the same thing. The frontend should use the shared one (it's what `client.auth.me()` returns).
- **Cookie-cache TTL.** Better Auth caches sessions in a signed cookie for 5 minutes (Chapter 2 set `cookieCache.maxAge = 5 * 60`). If you log out and `/me` still returns the user for a few seconds, that cache is why. The fix isn't tuning the TTL down — it's making `signOut()` issue a `Set-Cookie` that clears the cache. Better Auth's React client does this automatically when you call `signOut()`; just make sure you call _that_ and not just `fetch("/api/auth/sign-out")`.
