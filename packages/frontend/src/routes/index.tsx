// packages/frontend/src/routes/index.tsx
//
// THIS IS SMOKE-TEST SCAFFOLDING.
// ============================================================================
// Read this comment block before reading the code. The shape of this file is
// going to change a lot in Chapter 3 — what's here right now is the smallest
// thing that makes the Chapter 2 backend (auth + /me) clickable in a browser
// instead of having to drive it with curl.
//
// What's deliberately bad about this file:
//
//   - Every async call is run via `Effect.runPromise(...)` inside a click
//     handler or `useEffect`. No caching, no in-flight tracking, no
//     suspense, no error boundaries.
//   - The sign-in button uses bare `fetch`, NOT the Better Auth React client
//     (`createAuthClient` from `better-auth/react`) and NOT a typed Effect
//     client. The cookie-set, the POST/JSON shape, the `window.location =
//     data.url` redirect — all done by hand.
//   - The /me call goes through `ApiClient` (so we get a typed response and
//     a typed Unauthorized error in the `E` channel), but we don't pattern-
//     match on the error properly — we just stringify whatever comes out.
//   - The two booleans (`signedIn`, `loading`) are exactly the kind of
//     ad-hoc state machine `Atom.runtime` is designed to replace.
//
// All of those are problems Chapter 3 turns into wins:
//
//   - `@effect-atom/atom-react` for cached, request-scoped state.
//   - The Better Auth React client for the sign-in/sign-out UI.
//   - `Effect.catchTag("Unauthorized", ...)` discrimination in atom mappers.
//   - Real route gating via `_authed.tsx`.
//
// For now, this file's only job is "let Wouter click a button to sign in and
// see /me work". That's it. Resist the temptation to clean it up.
//
// HOW THE SIGN-IN BUTTON ACTUALLY WORKS
// ----------------------------------------------------------------------------
// Better Auth's social sign-in is `POST /api/auth/sign-in/social` with a JSON
// body `{ provider, callbackURL }`. The endpoint returns 200 with a body
// `{ url, redirect }` — the GitHub authorize URL. *The browser does not get
// redirected by the server.* The client (us) reads `data.url` and assigns it
// to `window.location`. That's why a plain <a href="/api/auth/sign-in/github">
// 404s — the route doesn't exist, and even if it did, the response would be
// JSON, not a 302. The Better Auth React client's `signIn.social({...})` call
// hides this dance; we're just doing it by hand here.

import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { Effect } from "effect"
import type { HealthResponse, User } from "@projectproject/shared"
import { ApiClient } from "../services/ApiClient"

export const Route = createFileRoute("/")({
  component: Home
})

function Home() {
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [me, setMe] = useState<User | { error: string } | null>(null)
  const [meLoading, setMeLoading] = useState(false)
  const [signInLoading, setSignInLoading] = useState(false)

  // Health check on mount — same as before; nothing auth-specific.
  useEffect(() => {
    const program = Effect
      .gen(function*() {
        const client = yield* ApiClient
        return yield* client.health.get()
      })
      .pipe(Effect.provide(ApiClient.Default))

    Effect.runPromise(program).then(setHealth).catch(console.error)
  }, [])

  // Click handler for "Sign in with GitHub". Bare fetch on purpose — the
  // Better Auth React client would do exactly this under the hood, and you
  // get a better feel for what's happening if you see it spelled out once.
  async function handleSignIn() {
    setSignInLoading(true)
    try {
      const res = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "github",
          // After the OAuth round-trip Better Auth bounces the browser here.
          // "/" is fine for now — this same component will then mount, see
          // the cookie, and the /me call below will return 200.
          callbackURL: "/"
        })
      })
      if (!res.ok) {
        // Most likely cause: misconfigured GITHUB_CLIENT_ID/SECRET, or the
        // GitHub OAuth app's callback URL doesn't match BETTER_AUTH_URL.
        const text = await res.text()
        console.error("sign-in failed:", res.status, text)
        setSignInLoading(false)
        return
      }
      const data = (await res.json()) as { url: string }
      // The actual "redirect to GitHub" step. The server gave us the URL;
      // we navigate the browser to it. GitHub will redirect back to
      // /api/auth/callback/github after consent.
      window.location.href = data.url
    } catch (err) {
      console.error(err)
      setSignInLoading(false)
    }
  }

  // Click handler for "Show /me". Goes through ApiClient — fully typed end
  // to end. If you're not signed in, the Effect fails with `Unauthorized`,
  // which we catch unceremoniously and stash as a string. Chapter 3 will
  // do this properly with `Effect.catchTag("Unauthorized", ...)`.
  function handleFetchMe() {
    setMeLoading(true)
    const program = Effect
      .gen(function*() {
        const client = yield* ApiClient
        return yield* client.auth.me()
      })
      .pipe(Effect.provide(ApiClient.Default))

    Effect.runPromise(program)
      .then((user) => setMe(user))
      .catch((err) => setMe({ error: String(err) }))
      .finally(() => setMeLoading(false))
  }

  return (
    <div style={{ fontFamily: "ui-monospace, monospace", padding: "1.5rem", lineHeight: 1.5 }}>
      <h1 style={{ marginTop: 0 }}>ProjectProject — smoke test</h1>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Health</h2>
        <pre>{health ? JSON.stringify(health, null, 2) : "loading..."}</pre>
      </section>

      <section style={{ marginTop: "1.5rem" }}>
        <h2>Auth</h2>
        <button onClick={handleSignIn} disabled={signInLoading}>
          {signInLoading ? "Redirecting…" : "Sign in with GitHub"}
        </button>
        {" "}
        <button onClick={handleFetchMe} disabled={meLoading}>
          {meLoading ? "Loading…" : "Show /me"}
        </button>
        <pre style={{ marginTop: "0.75rem" }}>
          {me ? JSON.stringify(me, null, 2) : "(no /me call yet)"}
        </pre>
      </section>

      <p style={{ marginTop: "2rem", opacity: 0.6 }}>
        Chapter 3 replaces this scaffolding with atom-driven state, the Better
        Auth React client, and proper error pattern-matching.
      </p>
    </div>
  )
}
