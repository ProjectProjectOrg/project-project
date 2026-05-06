// packages/backend/src/main.ts
//
// Backend entry point. This file's only job is to wire up the HttpApi from
// the shared package, attach an implementation, and run the resulting Layer
// on a Bun HTTP server.
//
// THE EFFECT MENTAL MODEL (one paragraph)
// ----------------------------------------------------------------------------
// An `Effect<A, E, R>` is a *description* of a computation. It does nothing
// until it is run by a runtime. `Layer<ROut, E, RIn>` is a description of how
// to construct services (the things in the `R` channel). You compose layers
// to build the dependency graph for your program, then a runtime resolves
// it. For HTTP, `@effect/platform` provides ready-made layers: one to
// implement an HttpApi (`HttpApiBuilder.api`), one to actually listen on a
// port (`BunHttpServer.layer` from `@effect/platform-bun`).
//
// WHAT'S IN THIS FILE
// ----------------------------------------------------------------------------
// Three handler groups (`health`, `db`, `auth`) implementing the contract
// from `@projectproject/shared`, plus the wiring that makes them serve over
// HTTP. Two mounts under the shared `/api` namespace coexist on the same
// Bun server:
//
//   - `/api/auth/*` — handed off to Better Auth's own request handler,
//                     mounted as a raw web app (it has its own routing,
//                     schemas, and cookie management).
//   - `/api/*`      — handled by the typed HttpApi pipeline (`/api/me`,
//                     `/api/health`, `/api/db/ping`).
//
// Order matters: `/api/auth` is registered first so its more-specific prefix
// wins the match; `/api/*` is the catch-all for everything else.
//
// The `/api` prefix is owned by the backend, not the frontend dev server.
// Vite's proxy in `packages/frontend/vite.config.ts` is a pure forwarder —
// no path rewriting — so a browser request to `:5173/api/me` arrives here
// as `:3000/api/me` exactly. Direct backend curls (`curl :3000/api/me`)
// hit the same path the frontend does.
//
// The interesting wiring lives at the bottom in `ServerLive`: an `HttpRouter`
// with two `mountApp` calls, an explicit `Effect.catchTag("RouteNotFound", ...)`
// fallback, and one shared layer chain providing every service the handlers
// and middleware need.
//
// MENTAL MODEL REMINDERS
// ----------------------------------------------------------------------------
// - `Effect<A, E, R>` is a description; nothing runs until a runtime executes
//   it. `Layer<ROut, E, RIn>` is a description of how to construct the `R`
//   side. We compose layers to build the dependency graph and let the Bun
//   runtime resolve it.
// - `Layer.provide` is directional ("this needs that underneath"); `Layer.merge`
//   is parallel. The chain at the bottom uses `provide` exclusively so that
//   `BetterAuthLive` and `DbLive` are reachable from anything above them
//   (including `AuthenticationLive`, which depends on `BetterAuth`).
// - `Layer.launch` rather than `Effect.runPromise` because layers describe
//   long-lived resources; launch keeps the server alive for the lifetime of
//   the process. `BunRuntime.runMain` adds Bun-specific signal handling and
//   exit-code mapping.

import {
  HttpApiBuilder,
  HttpApiSwagger,
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "@effect/platform"
import { BunHttpServer, BunRuntime } from "@effect/platform-bun"
import { AppApi } from "@projectproject/shared"
import { count } from "drizzle-orm"
import { Effect, Layer } from "effect"
import { projectIndex } from "./db/schema"
import { AuthHandlerLive } from "./handlers/auth"
import { ProjectsHandlerLive } from "./handlers/projects"
import { TicketsHandlerLive } from "./handlers/tickets"
import { AuthenticationLive } from "./services/Auth"
import { BetterAuth, BetterAuthLive } from "./services/BetterAuth"
import { CurrentOrg } from "./services/CurrentOrg"
import { Db, DbLive } from "./services/Db"
import { GitHub } from "./services/GitHub"
import { Markdown } from "./services/Markdown"
import { Projects } from "./services/Projects"
import { Tickets } from "./services/Tickets"
import { Users } from "./services/Users"

// Exported so tests can compose them without booting a real Bun server.
export const HealthHandlerLive = HttpApiBuilder.group(
  AppApi,
  "health",
  (handlers) =>
    handlers.handle("get", () => Effect.succeed({ status: "ok" as const }))
)

export const DbHandlerLive = HttpApiBuilder.group(AppApi, "db", (handlers) =>
  handlers.handle("ping", () =>
    Effect.gen(function* () {
      const db = yield* Db
      const [{ value }] = yield* db
        .select({ value: count() })
        .from(projectIndex)
      return { projectCount: value }
    }).pipe(Effect.orDie)
  )
)

const betterAuthApp = Effect.gen(function* () {
  const ba = yield* BetterAuth
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const webRes = yield* ba.handler(webReq)
  return HttpServerResponse.fromWeb(webRes)
}).pipe(
  Effect.catchAll(() => HttpServerResponse.text("Auth error", { status: 500 }))
)

export const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(HealthHandlerLive),
  Layer.provide(DbHandlerLive),
  Layer.provide(AuthHandlerLive),
  Layer.provide(ProjectsHandlerLive),
  Layer.provide(TicketsHandlerLive),
  Layer.provide(Tickets.Default),
  Layer.provide(Projects.Default),
  Layer.provide(CurrentOrg.Default),
  Layer.provide(GitHub.Default),
  Layer.provide(Users.Default),
  Layer.provide(Markdown.Default),
  Layer.provide(AuthenticationLive)
)

// Swagger UI lives under /api/docs and reads /api/docs/swagger.json (the
// derived OpenAPI spec). Both are implemented by `HttpApiSwagger.layer({...})`,
// which we mount alongside our typed handlers in the same Layer chain — no
// extra mountApp call needed; the layer adds routes to the api group.
const SwaggerLive = HttpApiSwagger.layer({ path: "/docs" })

const ServerLive = HttpApiBuilder.serve((apiApp) =>
  HttpRouter.empty.pipe(
    HttpRouter.mountApp("/api/auth", betterAuthApp),
    HttpRouter.mountApp("/api", apiApp),
    Effect.catchTag("RouteNotFound", () =>
      HttpServerResponse.text("Not Found", { status: 404 })
    )
  )
).pipe(
  Layer.provide(SwaggerLive),
  Layer.provide(ApiLive),
  Layer.provide(BetterAuthLive),
  Layer.provide(DbLive),
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)

// Only boot the real server when this file is the entry point. When tests
// import { ApiLive } from this module, `import.meta.main` is false and we
// skip the bind. (Bun-specific — Node has no equivalent built-in, but we're
// running on Bun.)
if (import.meta.main) {
  BunRuntime.runMain(Layer.launch(ServerLive))
}
