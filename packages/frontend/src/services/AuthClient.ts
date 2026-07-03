// packages/frontend/src/services/AuthClient.ts
//
// THE BETTER AUTH REACT CLIENT.
// ============================================================================
// `createAuthClient` from `better-auth/react` is a thin wrapper around the
// `/api/auth/*` endpoints. It exposes the social sign-in dance, sign-out, and
// session helpers. We only use the first two in Chapter 3.
//
// THIS IS NOT AN EFFECT SERVICE
// ----------------------------------------------------------------------------
// `ApiClient` (next door) is wrapped in `Effect.Service`. This one isn't.
// Why?
//
//   - Better Auth's client is promise-based. Wrapping it in Effect costs us
//     `Effect.tryPromise` calls everywhere with no real upside — there's no
//     Layer-mocking story we want here, the OAuth flow side-effects the
//     browser's location anyway, and atom-react's `runtime.fn` already lets
//     us call promises from atoms cleanly.
//   - The seam in the backend (`services/BetterAuth.ts`) wraps the *server*
//     instance because we want session-reading to be DI-friendly. The
//     frontend has no such need.
//
// The rule of thumb: not everything needs to be a service. Wrap things in
// Effect when wrapping pays for itself in DI, error tracking, or resource
// safety. Don't wrap for symmetry.
//
// USAGE FROM COMPONENTS
// ----------------------------------------------------------------------------
// Direct:
//
//   import { authClient } from "@/services/AuthClient"
//   await authClient.signIn.social({ provider: "google", callbackURL: "/" })
//
// Or wrapped in a `runtime.fn` if you want to refresh `meAtom` after sign-out.
// See `atoms/auth.ts` for that pattern.
//
// CHAPTER 3 STEPS
// ----------------------------------------------------------------------------
//   1. Imports:
//        import { createAuthClient } from "better-auth/react"
//
//   2. Build the client. The `baseURL` defaults to the current origin's
//      `/api/auth`, which is what we want — the Vite proxy forwards `/api/*`
//      to the backend on `:3000`, so cookies stay scoped to the dev origin.
//
//        export const authClient = createAuthClient()
//
//      You don't need to pass any options for the basic flow. If you want to
//      be explicit:
//
//        export const authClient = createAuthClient({
//          baseURL: typeof window !== "undefined" ? window.location.origin : undefined
//        })
//
// WHAT YOU GET
// ----------------------------------------------------------------------------
// - `authClient.signIn.social({ provider, callbackURL })` — POSTs to
//   `/api/auth/sign-in/social`, gets the GitHub authorize URL back, redirects
//   the browser to it. Compare to the by-hand `fetch` in the Chapter 2
//   smoke-test home; this collapses that ten-line block into one call.
// - `authClient.signOut()` — POSTs to `/api/auth/sign-out`, clears the
//   session cookie (server-side), and clears the cookie-cache.
// - `authClient.useSession()` — a React hook; we won't use it. We'll read
//   the session via `meAtom` instead, because that goes through *our* typed
//   client and gives us the typed `Unauthorized` failure we already handle.

import { createAuthClient } from "better-auth/react"
import {
  inferAdditionalFields,
  magicLinkClient,
  organizationClient
} from "better-auth/client/plugins"

export const authClient = createAuthClient({
  plugins: [
    organizationClient(),
    magicLinkClient(),
    inferAdditionalFields({
      user: {
        editorPreference: { type: "string", required: false, input: true }
      }
    })
  ]
})
