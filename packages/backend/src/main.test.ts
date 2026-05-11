// packages/backend/src/main.test.ts
//
// Chapter 0 — backend handler tests.
// ============================================================================
// First test (the one you wrote): asserts the happy path of `health.get`.
// Below it, three extra tests fill out the coverage you'll lean on in later
// chapters:
//
//   - the Content-Type header is JSON (the schema-driven serialization story)
//   - an unknown route returns 404 (proves the router is wired, not just the
//     one handler)
//   - `HttpApiClient.make(AppApi)` against an in-process transport (the spec's
//     recommended pattern — same client the frontend uses, full type-checked,
//     no string URLs in tests)
//
// All four tests share one `toWebHandler` instance for speed. In Chapter 2+
// where handlers depend on services with state (Db, Markdown), you'll build a
// fresh handler per test (or per file) so layers don't leak between cases.
//
// HOW WE TEST WITHOUT A REAL SERVER
// ----------------------------------------------------------------------------
// `HttpApiBuilder.toWebHandler` turns an API layer into a plain
// `(request: Request) => Promise<Response>` function. No port binding, no
// network — the full Effect pipeline runs in-process. The catch is that the
// returned function isn't enough on its own: `toWebHandler` requires the
// layer to provide `HttpApi.Api` AND `HttpServer.layerContext` (the default
// HttpRouter services that `BunHttpServer.layer` would normally bundle in).
// We merge them in below.
//
// THE IN-PROCESS CLIENT TRICK
// ----------------------------------------------------------------------------
// `HttpApiClient.make(AppApi)` builds a client that calls a service named
// `FetchHttpClient.Fetch` to do its actual HTTP. By default that service is
// the global `fetch`. In tests we swap it for a function that calls our
// `toWebHandler` directly, so a `client.health.get()` call inside the test
// dispatches to our in-memory handler with no network hop. Same client API
// the frontend uses; same types; full contract enforcement.

import { it } from "@effect/vitest"
import {
  FetchHttpClient,
  HttpApiBuilder,
  HttpApiClient,
  HttpServer
} from "@effect/platform"
import { AppApi } from "@projectproject/shared"
import { Effect, Layer } from "effect"
import { expect } from "vitest"
import { BetterAuth, type BetterAuthShape } from "./Services/BetterAuth"
import { Db } from "./Services/Db"
import { ApiLive } from "./main"

// `ApiLive` now includes `DbHandlerLive`, which carries `PgDrizzle` (the `Db`
// Tag) in its requirements. The tests below don't exercise `/db/ping`, but we
// still have to satisfy the type. A stub `Db` is enough — if a test ever
// actually calls into it, this would throw at runtime, which is the right
// failure mode (a test calling the DB through this handler should fail loudly).
const FakeDbLive = Layer.succeed(Db, {} as never)

const unexpectedBetterAuthCall = (method: string): Effect.Effect<never> =>
  Effect.die(new Error(`unexpected BetterAuth.${method} call`))

const FakeBetterAuth = {
  handler: () => unexpectedBetterAuthCall("handler"),
  getSession: () => unexpectedBetterAuthCall("getSession"),
  getGithubAccessToken: () => unexpectedBetterAuthCall("getGithubAccessToken"),
  getOrgSlugById: () => unexpectedBetterAuthCall("getOrgSlugById")
} satisfies BetterAuthShape

const FakeBetterAuthLive = Layer.succeed(BetterAuth, FakeBetterAuth)

// One shared web handler for the whole suite.
const { handler } = HttpApiBuilder.toWebHandler(
  Layer.mergeAll(ApiLive, HttpServer.layerContext).pipe(
    Layer.provide(FakeDbLive),
    Layer.provide(FakeBetterAuthLive)
  )
)

// Layer that lets `HttpApiClient.make(AppApi)` reach our in-process handler
// instead of the network. We override the `FetchHttpClient.Fetch` service —
// the seam through which `FetchHttpClient.layer` makes its requests.
const InProcessFetch = Layer.succeed(FetchHttpClient.Fetch, ((input, init) =>
  handler(
    input instanceof Request ? input : new Request(String(input), init)
  )) as typeof fetch)
const TestHttpClientLayer = FetchHttpClient.layer.pipe(
  Layer.provide(InProcessFetch)
)

// ----------------------------------------------------------------------------
// 1. The test you wrote: happy path through the raw web handler.
// ----------------------------------------------------------------------------

it.effect("GET /health responds with { status: 'ok' } and a 200", () =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() =>
      handler(new Request("http://localhost/health"))
    )

    expect(response.status).toBe(200)

    const body = yield* Effect.promise(() => response.json())
    expect(body).toEqual({ status: "ok" })
  })
)

// ----------------------------------------------------------------------------
// 2. Content-Type header. Cheap, but verifies the schema-driven serializer
//    actually runs — a misconfigured handler that returned plain text would
//    pass the body check but fail this one.
// ----------------------------------------------------------------------------

it.effect("GET /health sets Content-Type to JSON", () =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() =>
      handler(new Request("http://localhost/health"))
    )

    // The platform sets `application/json` with charset/profile suffixes
    // depending on version, so don't assert exact equality — just match the
    // type prefix.
    expect(response.headers.get("content-type")).toMatch(/^application\/json/)
  })
)

// ----------------------------------------------------------------------------
// 3. Unknown route. Proves the router rejects what it doesn't know about,
//    rather than (e.g.) returning 200 with the only handler we've defined.
// ----------------------------------------------------------------------------

it.effect("GET /unknown returns 404", () =>
  Effect.gen(function* () {
    const response = yield* Effect.promise(() =>
      handler(new Request("http://localhost/unknown"))
    )

    expect(response.status).toBe(404)
  })
)

// ----------------------------------------------------------------------------
// 4. Same endpoint, exercised through the typed `HttpApiClient` — the pattern
//    you'll use for all real integration tests from Chapter 2 onward.
//
//    Notice what we DON'T write here:
//      - no string URL ("/health")
//      - no manual JSON parsing
//      - no manual status-code handling
//    The contract carries everything. Add `.addError(NotFound)` to the
//    endpoint and this test would suddenly have to discriminate the success
//    and error branches via the Effect's `E` channel — the type system
//    forcing the test to keep up with the contract.
// ----------------------------------------------------------------------------

it.effect("HttpApiClient.health.get() returns { status: 'ok' }", () =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(AppApi, {
      baseUrl: "http://localhost"
    })
    const result = yield* client.health.get()

    expect(result).toEqual({ status: "ok" })
  }).pipe(Effect.provide(TestHttpClientLayer))
)
