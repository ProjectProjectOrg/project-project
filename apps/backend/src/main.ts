import { createHmac, timingSafeEqual } from "node:crypto"
// apps/backend/src/main.ts
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
// Handler groups implement the contract from `@pp/shared`, and the
// runtime module provides the service graph they call into. Three mounts under
// the shared `/api` namespace coexist on the same
// Bun server:
//
//   - `/api/auth/*` — handed off to Better Auth's own request handler,
//                     mounted as a raw web app (it has its own routing,
//                     schemas, and cookie management).
//   - `/api/integrations/github/*` — GitHub App setup, OAuth callback, and
//                                    webhook endpoints.
//   - `/api/*`      — handled by the typed HttpApi pipeline (`/api/me`,
//                     `/api/health`, `/api/db/ping`).
//
// Order matters: `/api/auth` is registered first so its more-specific prefix
// wins the match; `/api/*` is the catch-all for everything else.
//
// The `/api` prefix is owned by the backend, not the frontend dev server.
// Vite's proxy in `apps/frontend/vite.config.ts` is a pure forwarder —
// no path rewriting — so a browser request to `:5173/api/me` arrives here
// as `:3000/api/me` exactly. Direct backend curls (`curl :3000/api/me`)
// hit the same path the frontend does.
//
// The HTTP wiring lives at the bottom in `ServerLive`: an `HttpRouter` with two
// `mountApp` calls, an explicit `Effect.catchTag("RouteNotFound", ...)`
// fallback, and transport-specific layers around the shared backend runtime.
//
// MENTAL MODEL REMINDERS
// ----------------------------------------------------------------------------
// - `Effect<A, E, R>` is a description; nothing runs until a runtime executes
//   it. `Layer<ROut, E, RIn>` is a description of how to construct the `R`
//   side. We compose layers to build the dependency graph and let the Bun
//   runtime resolve it.
// - `Layer.provide` is directional ("this needs that underneath"); `Layer.merge`
//   is parallel. The backend service graph lives in `runtime.ts`; this file adds
//   the HTTP transport and route mounts around it.
// - `Layer.launch` rather than `Effect.runPromise` because layers describe
//   long-lived resources; launch keeps the server alive for the lifetime of
//   the process. `BunRuntime.runMain` adds Bun-specific signal handling and
//   exit-code mapping.

import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { projectIndex } from "@pp/db/schema"
import { AttachmentReaperLive } from "@pp/server-core/attachments/AttachmentReaperLive"
import { BetterAuth } from "@pp/server-core/auth/BetterAuth"
import { EverhourWebhooks } from "@pp/server-core/everhour/EverhourWebhooks"
import { EverhourWebhooksLive } from "@pp/server-core/everhour/EverhourWebhooksLive"
import { GitHubIntegrations } from "@pp/server-core/github/GitHubIntegrations"
import { GitHubWebhooks } from "@pp/server-core/github/GitHubWebhooks"
import { GitHubWebhooksLive } from "@pp/server-core/github/GitHubWebhooksLive"
import { TicketIndexReconcilerLive } from "@pp/server-core/tickets/TicketIndexReconcilerLive"
import { AppApi } from "@pp/shared"
import { count } from "drizzle-orm"
import * as Config from "effect/Config"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"
import { HttpApiBuilder, HttpApiSwagger } from "effect/unstable/httpapi"

import { AttachmentsHandlerLive } from "./handlers/attachments"
import { AuthHandlerLive } from "./handlers/auth"
import { CommentsHandlerLive } from "./handlers/comments"
import { EverhourHandlerLive } from "./handlers/everhour"
import { FigmaHandlerLive } from "./handlers/figma"
import { GroupsHandlerLive } from "./handlers/groups"
import { InvitationsHandlerLive } from "./handlers/invitations"
import { LibraryHandlerLive } from "./handlers/library"
import {
  OAuthApplicationsHandlerLive,
  PublicOAuthHandlerLive
} from "./handlers/oauthApplications"
import { OrgHandlerLive } from "./handlers/org"
import { ProjectsHandlerLive } from "./handlers/projects"
import { StatusesHandlerLive } from "./handlers/statuses"
import { StorageHandlerLive } from "./handlers/storage"
import { TagsHandlerLive } from "./handlers/tags"
import { TicketsHandlerLive } from "./handlers/tickets"
import { attachmentRoutes } from "./http/attachmentRoutes"
import { attachmentUploadRoute } from "./http/attachmentUploadRoutes"
import { figmaOauthRoutes } from "./http/figmaOauthRoutes"
import { figmaThumbnailRoutes } from "./http/figmaThumbnailRoutes"
import { JiraHandlerLive } from "./jira/Handlers"
import { JiraMigrationsHandlerLive } from "./jira/MigrationHandlers"
import { jiraOauthRoutes } from "./jira/OAuthRoutes"
import { McpLive } from "./Layers/Mcp"
import { BackendHttpServicesLive, BackendInfrastructureLive } from "./runtime"

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
        .where(publishedProject())
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
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("auth route failure", cause),
      Effect.succeed(HttpServerResponse.text("Auth error", { status: 500 }))
    )
  )
)

export const ApiRoutesLive = HttpApiBuilder.layer(AppApi).pipe(
  Layer.provide(HealthHandlerLive),
  Layer.provide(DbHandlerLive),
  Layer.provide(AuthHandlerLive),
  Layer.provide(OrgHandlerLive),
  Layer.provide(InvitationsHandlerLive),
  Layer.provide(ProjectsHandlerLive),
  Layer.provide(EverhourHandlerLive),
  Layer.provide(FigmaHandlerLive),
  Layer.provide(JiraHandlerLive),
  Layer.provide(JiraMigrationsHandlerLive),
  Layer.provide(TicketsHandlerLive),
  Layer.provide(CommentsHandlerLive),
  Layer.provide(TagsHandlerLive),
  Layer.provide(StatusesHandlerLive),
  Layer.provide(GroupsHandlerLive),
  Layer.provide(LibraryHandlerLive),
  Layer.provide(OAuthApplicationsHandlerLive),
  Layer.provide(PublicOAuthHandlerLive),
  Layer.provide(StorageHandlerLive),
  Layer.provide(AttachmentsHandlerLive)
)

export const ApiLive = ApiRoutesLive.pipe(
  Layer.provide(BackendHttpServicesLive)
)

// Swagger UI lives under /api/docs and reads /api/docs/swagger.json (the
// derived OpenAPI spec). Both are implemented by `HttpApiSwagger.layer({...})`,
// which we mount alongside our typed handlers in the same Layer chain — no
// extra mountApp call needed; the layer adds routes to the api group.
const SwaggerLive = HttpApiSwagger.layer(AppApi, { path: "/docs" })

const badRequest = (message: string) =>
  HttpServerResponse.text(message, { status: 400 })

const GithubSetupQuery = Schema.fromURLSearchParams(
  Schema.Struct({
    state: Schema.NonEmptyString,
    installation_id: Schema.NonEmptyString
  })
)
const GithubCallbackQuery = Schema.fromURLSearchParams(
  Schema.Struct({
    state: Schema.NonEmptyString,
    code: Schema.NonEmptyString
  })
)

const githubSetupRoute = Effect.gen(function* () {
  const integrations = yield* GitHubIntegrations
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const query = Schema.decodeOption(GithubSetupQuery)(url.searchParams)
  if (Option.isNone(query)) return badRequest("Missing GitHub setup state")
  const { authorizeUrl } = yield* integrations.completeSetup(
    query.value.state,
    query.value.installation_id
  )
  return HttpServerResponse.redirect(authorizeUrl)
}).pipe(
  Effect.catchTags({
    NotFound: () =>
      Effect.succeed(
        HttpServerResponse.text("GitHub setup expired", { status: 404 })
      ),
    GitHubError: () =>
      Effect.succeed(
        HttpServerResponse.text("GitHub setup failed", { status: 500 })
      )
  }),
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("github setup route failure", cause),
      Effect.succeed(
        HttpServerResponse.text("GitHub setup failed", { status: 500 })
      )
    )
  )
)

const githubCallbackRoute = Effect.gen(function* () {
  const integrations = yield* GitHubIntegrations
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const query = Schema.decodeOption(GithubCallbackQuery)(url.searchParams)
  if (Option.isNone(query)) return badRequest("Missing GitHub callback state")
  const { redirectUrl } = yield* integrations.completeCallback(
    query.value.state,
    query.value.code
  )
  return HttpServerResponse.redirect(redirectUrl)
}).pipe(
  Effect.catchTags({
    NotFound: () =>
      Effect.succeed(
        HttpServerResponse.text("GitHub callback expired", { status: 404 })
      ),
    Forbidden: () =>
      Effect.succeed(
        HttpServerResponse.text("GitHub installation was not verified", {
          status: 403
        })
      ),
    GitHubError: () =>
      Effect.succeed(
        HttpServerResponse.text("GitHub callback failed", { status: 500 })
      )
  }),
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("github callback route failure", cause),
      Effect.succeed(
        HttpServerResponse.text("GitHub callback failed", { status: 500 })
      )
    )
  )
)

export const verifyGithubWebhook = (
  body: string,
  signature: string | null,
  secret: string
) => {
  if (!signature?.startsWith("sha256=")) return false
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`
  const actualBuffer = Buffer.from(signature)
  const expectedBuffer = Buffer.from(expected)
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  )
}

export const GITHUB_WEBHOOK_MAX_BODY_BYTES = 25 * 1024 * 1024

class GithubWebhookBodyTooLarge extends Data.TaggedError(
  "GithubWebhookBodyTooLarge"
)<{}> {}

class GithubWebhookBodyReadError extends Data.TaggedError(
  "GithubWebhookBodyReadError"
)<{ readonly cause: unknown }> {}

export const readGithubWebhookBody = (
  webReq: Request,
  maxBytes = GITHUB_WEBHOOK_MAX_BODY_BYTES
) =>
  Effect.tryPromise({
    try: async () => {
      const lengthHeader = webReq.headers.get("content-length")
      const contentLength = lengthHeader === null ? null : Number(lengthHeader)
      if (
        contentLength !== null &&
        Number.isFinite(contentLength) &&
        contentLength > maxBytes
      ) {
        throw new GithubWebhookBodyTooLarge()
      }

      const reader = webReq.body?.getReader()
      if (!reader) return ""

      const decoder = new TextDecoder()
      const chunks: Array<string> = []
      let bytes = 0

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        bytes += value.byteLength
        if (bytes > maxBytes) {
          await reader.cancel()
          throw new GithubWebhookBodyTooLarge()
        }
        chunks.push(decoder.decode(value, { stream: true }))
      }

      chunks.push(decoder.decode())
      return chunks.join("")
    },
    catch: (cause) =>
      cause instanceof GithubWebhookBodyTooLarge
        ? cause
        : new GithubWebhookBodyReadError({ cause })
  })

export const githubWebhookRoute = Effect.gen(function* () {
  const webhooks = yield* GitHubWebhooks
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const body = yield* readGithubWebhookBody(webReq).pipe(
    Effect.catchTag("GithubWebhookBodyTooLarge", () => Effect.succeed(null))
  )
  if (body === null) {
    return HttpServerResponse.text("GitHub webhook payload too large", {
      status: 413
    })
  }
  const secret = yield* Config.Redacted("GITHUB_APP_WEBHOOK_SECRET")
  const verified = verifyGithubWebhook(
    body,
    webReq.headers.get("x-hub-signature-256"),
    Redacted.value(secret)
  )
  if (!verified) {
    return HttpServerResponse.text("Invalid signature", { status: 401 })
  }
  const event = webReq.headers.get("x-github-event")
  if (!event) {
    return badRequest("Missing GitHub event")
  }
  yield* webhooks.handle({
    event,
    deliveryId: webReq.headers.get("x-github-delivery"),
    body
  })
  return HttpServerResponse.text("ok")
}).pipe(
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("github webhook route failure", cause),
      Effect.succeed(
        HttpServerResponse.text("GitHub webhook failed", { status: 500 })
      )
    )
  )
)

const githubIntegrationRoutes = HttpRouter.addAll(
  [
    HttpRouter.route("GET", "/setup", githubSetupRoute),
    HttpRouter.route("GET", "/callback", githubCallbackRoute),
    HttpRouter.route("POST", "/webhook", githubWebhookRoute)
  ],
  { prefix: "/api/integrations/github" }
)

export const everhourWebhookRoute = Effect.gen(function* () {
  const webhooks = yield* EverhourWebhooks
  const req = yield* HttpServerRequest.HttpServerRequest
  const webReq = yield* HttpServerRequest.toWeb(req)
  const url = new URL(webReq.url)
  const match = url.pathname.match(/\/webhook\/([^/]+)\/?$/)
  const secret = match?.[1] ? decodeURIComponent(match[1]) : null
  if (!secret) return badRequest("Missing webhook secret")
  const body = yield* Effect.promise(() => webReq.text().catch(() => ""))
  yield* webhooks.handle({ secret, body })
  return HttpServerResponse.text("ok")
}).pipe(
  Effect.catchCause((cause) =>
    Effect.andThen(
      Effect.logError("everhour webhook route failure", cause),
      Effect.succeed(HttpServerResponse.text("ok"))
    )
  )
)

const everhourIntegrationRoutes = HttpRouter.add(
  "POST",
  "/api/integrations/everhour/webhook/:secret",
  everhourWebhookRoute
)

export const ApiRouterLive = Layer.effect(
  HttpRouter.HttpRouter,
  Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed("/api"))
)

export const RouteLive = Layer.mergeAll(
  HttpRouter.add("*", "/api/auth/*", betterAuthApp),
  HttpRouter.add("*", "/.well-known/*", betterAuthApp),
  githubIntegrationRoutes,
  everhourIntegrationRoutes,
  figmaOauthRoutes,
  jiraOauthRoutes,
  HttpRouter.add(
    "GET",
    "/api/figma-thumbnails/:orgSlug/:linkId",
    figmaThumbnailRoutes
  ),
  HttpRouter.add(
    "GET",
    "/api/attachments/:orgSlug/:attachmentId",
    attachmentRoutes
  ),
  HttpRouter.add("POST", "/api/attachment-uploads", attachmentUploadRoute),
  McpLive,
  Layer.mergeAll(ApiLive, SwaggerLive).pipe(Layer.provide(ApiRouterLive))
)

const ServerLive = HttpRouter.serve(RouteLive).pipe(
  Layer.provide(GitHubWebhooksLive),
  Layer.provide(EverhourWebhooksLive),
  Layer.provide(BackendHttpServicesLive),
  Layer.provide(BackendInfrastructureLive)
)

const ReconcilerLive = TicketIndexReconcilerLive.pipe(
  Layer.provide(BackendHttpServicesLive),
  Layer.provide(BackendInfrastructureLive)
)

const ReaperLive = AttachmentReaperLive.pipe(
  Layer.provide(BackendHttpServicesLive),
  Layer.provide(BackendInfrastructureLive)
)

const AppLive = Layer.mergeAll(ServerLive, ReconcilerLive, ReaperLive)

// Only boot the real server when this file is the entry point. When tests
// import { ApiLive } from this module, `import.meta.main` is false and we
// skip the bind. (Bun-specific — Node has no equivalent built-in, but we're
// running on Bun.)
if (import.meta.main) {
  const BunHttpServer = await import("@effect/platform-bun/BunHttpServer")
  const BunRuntime = await import("@effect/platform-bun/BunRuntime")
  BunRuntime.runMain(
    Layer.launch(
      AppLive.pipe(Layer.provide(BunHttpServer.layer({ port: 3000 })))
    )
  )
}
