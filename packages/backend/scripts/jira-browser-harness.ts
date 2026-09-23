import { createHash, generateKeyPairSync, randomUUID } from "node:crypto"
import { CreateBucketCommand, S3Client } from "@aws-sdk/client-s3"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { Effect, Layer, Redacted, Schema } from "effect"
import {
  HttpRouter,
  HttpServerRequest,
  HttpServerResponse
} from "effect/unstable/http"
import { Pool } from "pg"
import { JiraTransport } from "../src/Jira/Client"
import {
  JiraBrowserScenario,
  createJiraBrowserFixture,
  type JiraBrowserFixture
} from "../src/Jira/BrowserFixtures"
import { JiraOAuthConfig, JiraTokenEndpoint } from "../src/Jira/OAuth"

export type JiraBrowserResources = Readonly<{
  databaseUrl: string
  s3Endpoint: string
  bucket: string
  hostname: string
}>

const browserFrontendOrigin = "http://127.0.0.1:5174"

const loopbackHost = (hostname: string) =>
  hostname === "127.0.0.1" || hostname === "localhost"

export const assertBrowserResources = (resources: JiraBrowserResources) => {
  let database: URL
  let s3: URL
  try {
    database = new URL(resources.databaseUrl)
    s3 = new URL(resources.s3Endpoint)
  } catch {
    throw new Error("Invalid Jira browser resource URL")
  }
  if (
    database.protocol !== "postgres:" ||
    !loopbackHost(database.hostname) ||
    database.port !== "55432" ||
    database.pathname !== "/projectproject_effect_v4_t172_browser" ||
    database.search !== "" ||
    database.hash !== ""
  )
    throw new Error("Jira browser harness requires the isolated database")
  if (
    s3.protocol !== "http:" ||
    !loopbackHost(s3.hostname) ||
    s3.port !== "59000" ||
    s3.pathname !== "/" ||
    s3.search !== "" ||
    s3.hash !== "" ||
    s3.username !== "" ||
    s3.password !== "" ||
    resources.bucket !== "projectproject-t172-local-browser"
  )
    throw new Error("Jira browser harness requires the isolated bucket")
  if (!loopbackHost(resources.hostname))
    throw new Error("Jira browser harness must bind to loopback")
}

const response = (body: unknown, status = 200) =>
  HttpServerResponse.fromWeb(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" }
    })
  )

const callbackDestination = (redirectUri: string, state: string) => {
  let destination: URL
  try {
    destination = new URL(redirectUri)
  } catch {
    return null
  }
  if (
    destination.origin !== browserFrontendOrigin ||
    destination.pathname !== "/api/integrations/jira/oauth/callback"
  )
    return null
  destination.searchParams.set("code", `fixture-${randomUUID()}`)
  destination.searchParams.set("state", state)
  return destination
}

export const makeJiraBrowserControlRoutes = (fixture: JiraBrowserFixture) =>
  HttpRouter.addAll(
    [
      HttpRouter.route(
        "GET",
        "/authorize",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const web = yield* HttpServerRequest.toWeb(request)
          const url = new URL(web.url)
          const state = url.searchParams.get("state")
          const redirectUri = url.searchParams.get("redirect_uri")
          if (!state || !redirectUri)
            return response({ error: "invalid_authorization" }, 400)
          const destination = callbackDestination(redirectUri, state)
          if (destination === null)
            return response({ error: "invalid_authorization" }, 400)
          return HttpServerResponse.redirect(destination.toString(), {
            status: 302
          })
        })
      ),
      HttpRouter.route(
        "POST",
        "/scenario",
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const web = yield* HttpServerRequest.toWeb(request)
          const body = yield* Effect.tryPromise(() => web.json()).pipe(
            Effect.orElseSucceed(() => null)
          )
          const parsed = Schema.decodeUnknownExit(
            Schema.Struct({ scenario: JiraBrowserScenario })
          )(body)
          if (parsed._tag === "Failure")
            return response({ error: "invalid_scenario" }, 400)
          yield* fixture.setScenario(parsed.value.scenario)
          return response({ scenario: parsed.value.scenario })
        })
      ),
      HttpRouter.route(
        "POST",
        "/release-attachment",
        fixture.releaseAttachment.pipe(Effect.as(response({ released: true })))
      ),
      HttpRouter.route(
        "GET",
        "/calls",
        fixture.calls.pipe(Effect.map((calls) => response(calls)))
      )
    ],
    { prefix: "/__jira-harness" }
  )

const provisionResources = (input: JiraBrowserResources) =>
  Effect.tryPromise(async () => {
    const pool = new Pool({ connectionString: input.databaseUrl })
    try {
      await migrate(drizzle({ client: pool }), {
        migrationsFolder: `${import.meta.dirname}/../src/db/migrations`
      })
    } finally {
      await pool.end()
    }
    const s3 = new S3Client({
      endpoint: input.s3Endpoint,
      region: "us-east-1",
      forcePathStyle: true,
      credentials: {
        accessKeyId: "projectproject",
        secretAccessKey: "projectproject_dev"
      }
    })
    try {
      await s3.send(new CreateBucketCommand({ Bucket: input.bucket }))
    } catch (cause) {
      if (
        !(cause instanceof Error) ||
        !["BucketAlreadyOwnedByYou", "BucketAlreadyExists"].includes(cause.name)
      )
        throw cause
    } finally {
      s3.destroy()
    }
  })

export const makeJiraBrowserHarnessLive = async (
  fixture: JiraBrowserFixture
) => {
  const [
    { RouteLive },
    { McpHttpLive },
    { McpServerLive },
    { GitHubWebhooksLive },
    { EverhourWebhooksLive },
    { BackendInfrastructureLive, makeBackendHttpServicesLive }
  ] = await Promise.all([
    import("../src/main"),
    import("../src/Layers/McpHttp"),
    import("../src/Layers/McpServer"),
    import("../src/Layers/GitHubWebhooks"),
    import("../src/Layers/EverhourWebhooks"),
    import("../src/runtime")
  ])
  const services = makeBackendHttpServicesLive(
    Layer.succeed(JiraTransport, fixture.transport),
    Layer.succeed(JiraTokenEndpoint, fixture.tokenEndpoint),
    Layer.succeed(JiraOAuthConfig, {
      clientId: "fixture-client",
      clientSecret: Redacted.make("fixture-secret"),
      publicBaseUrl: browserFrontendOrigin,
      authorizationEndpoint: "http://127.0.0.1:3000/__jira-harness/authorize"
    })
  )
  return HttpRouter.serve(
    Layer.mergeAll(RouteLive, makeJiraBrowserControlRoutes(fixture))
  ).pipe(
    Layer.provide(McpHttpLive),
    Layer.provide(McpServerLive),
    Layer.provide(GitHubWebhooksLive),
    Layer.provide(EverhourWebhooksLive),
    Layer.provide(services),
    Layer.provide(BackendInfrastructureLive)
  )
}

if (import.meta.main) {
  const BunHttpServer = await import("@effect/platform-bun/BunHttpServer")
  const BunRuntime = await import("@effect/platform-bun/BunRuntime")
  const resources = {
    databaseUrl: process.env.PROJECTPROJECT_TEST_DATABASE_URL ?? "",
    s3Endpoint: process.env.JIRA_BROWSER_S3_ENDPOINT ?? "",
    bucket: process.env.JIRA_BROWSER_BUCKET ?? "",
    hostname: "127.0.0.1"
  }
  assertBrowserResources(resources)
  process.env.DATABASE_URL = resources.databaseUrl
  process.env.PROJECTS_DIR = `${import.meta.dirname}/../.tmp/jira-browser-projects`
  process.env.BETTER_AUTH_URL = browserFrontendOrigin
  process.env.BETTER_AUTH_SECRET = createHash("sha256")
    .update("projectproject-t172-local-browser-auth")
    .digest("hex")
  process.env.USER_SECRET_ENCRYPTION_KEY = createHash("sha256")
    .update("projectproject-t172-local-browser")
    .digest("base64")
  process.env.GITHUB_APP_ID = "1"
  process.env.GITHUB_APP_PRIVATE_KEY = generateKeyPairSync("rsa", {
    modulusLength: 2048
  })
    .privateKey.export({ type: "pkcs1", format: "pem" })
    .toString()
  process.env.GITHUB_APP_CLIENT_ID = "fixture-client"
  process.env.GITHUB_APP_CLIENT_SECRET = "fixture-secret"
  process.env.GITHUB_APP_WEBHOOK_SECRET = "fixture-webhook-secret"
  BunRuntime.runMain(
    Effect.gen(function* () {
      yield* provisionResources(resources)
      const fixture = yield* createJiraBrowserFixture("happy_path")
      const harness = yield* Effect.promise(() =>
        makeJiraBrowserHarnessLive(fixture)
      )
      return yield* Layer.launch(
        harness.pipe(
          Layer.provide(
            BunHttpServer.layer({ hostname: resources.hostname, port: 3000 })
          )
        )
      )
    })
  )
}
