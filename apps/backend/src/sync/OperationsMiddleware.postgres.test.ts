// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { it } from "@effect/vitest"
import { DbLive, PgLive } from "@pp/db"
import * as CommandReceipts from "@pp/server-core/sync/CommandReceipts"
import * as SyncLog from "@pp/server-core/sync/SyncLog"
import {
  Conflict,
  CurrentUser,
  OPERATION_ID_HEADER,
  Operations,
  SYNC_RECEIPT_HEADER,
  User
} from "@pp/shared"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServer } from "effect/http"
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware
} from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import pg from "pg"
import { describe, expect } from "vitest"

import { OperationsLive } from "./OperationsMiddleware"

const { Client } = pg
const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

if (databaseUrl) {
  const url = new URL(databaseUrl)
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !url.pathname.startsWith("/projectproject_effect_v4_")
  ) {
    throw new Error("Test requires an isolated local database")
  }
  process.env.DATABASE_URL = databaseUrl
}

class SignedIn extends HttpApiMiddleware.Service<
  SignedIn,
  { provides: CurrentUser }
>()("test/SignedIn") {}

const Api = HttpApi.make("operations-test").add(
  HttpApiGroup.make("things")
    .add(
      HttpApiEndpoint.post("create", "/things", {
        payload: Schema.Struct({ name: Schema.String }),
        success: Schema.Struct({ runs: Schema.Number }),
        error: [Conflict]
      })
    )
    .middleware(Operations)
    .middleware(SignedIn)
)

const withClient = <A>(use: (client: pg.Client) => Promise<A>) =>
  Effect.tryPromise(async () => {
    const client = new Client({ connectionString: databaseUrl })
    await client.connect()
    try {
      return await use(client)
    } finally {
      await client.end()
    }
  }).pipe(Effect.orDie)

const seed = Effect.gen(function* () {
  const organizationId = `operations-${randomUUID()}`
  const projectId = randomUUID()
  const userId = `operations-${randomUUID()}`
  yield* withClient(async (client) => {
    await client.query(
      "insert into organization (id, name, slug, created_at) values ($1, $1, $1, now())",
      [organizationId]
    )
    await client.query(
      "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, created_at) values ($1, $2, $2, 'T', 'Operations', 'folder', 'blue', 'test-user', now())",
      [projectId, organizationId]
    )
    await client.query(
      `insert into "user" (id, name, email, created_at, updated_at) values ($1, 'Test', $1, now(), now())`,
      [userId]
    )
  })
  yield* Effect.addFinalizer(() =>
    withClient(async (client) => {
      await client.query("delete from organization where id = $1", [
        organizationId
      ])
      await client.query(`delete from "user" where id = $1`, [userId])
    })
  )
  return { projectId, userId }
})

const decodeUser = Schema.decodeEffect(User)

const encodePayload = Schema.encodeSync(
  Schema.fromJsonString(Schema.Struct({ name: Schema.String }))
)

const TestLayer = SyncLog.layer.pipe(
  Layer.provideMerge(DbLive.pipe(Layer.provideMerge(PgLive)))
)

const serve = (projectId: string, userId: string) =>
  Effect.gen(function* () {
    const log = yield* SyncLog.SyncLog
    const runs = { count: 0 }
    const things = HttpApiBuilder.group(Api, "things", (handlers) =>
      handlers.handle("create", ({ payload }) =>
        Effect.gen(function* () {
          runs.count += 1
          if (payload.name === "taken")
            return yield* new Conflict({ reason: "taken" })
          if (payload.name === "crash") return yield* Effect.die("crash")
          yield* log.append(projectId, [
            { kind: "ticket", id: `T-${runs.count}`, op: "upsert" }
          ])
          return { runs: runs.count }
        })
      )
    )
    const user = yield* decodeUser({
      id: userId,
      email: userId,
      name: "Test",
      username: null,
      image: null,
      createdAt: "2026-11-16T00:00:00.000Z",
      activeOrgSlug: null,
      personalGithub: { connected: false },
      editorPreference: "github",
      personalEverhour: {
        connected: false,
        everhourUserId: null,
        name: null,
        email: null,
        lastVerifiedAt: null,
        lastCheckError: null
      }
    }).pipe(Effect.orDie)
    const signedIn = Layer.succeed(SignedIn, (effect) =>
      Effect.provideService(effect, CurrentUser, user)
    )
    const app = HttpRouter.toWebHandler(
      HttpApiBuilder.layer(Api).pipe(
        Layer.provide(things),
        Layer.provide(signedIn),
        Layer.provide(OperationsLive),
        Layer.provide(CommandReceipts.layer),
        Layer.provide(TestLayer),
        Layer.provide(HttpServer.layerServices)
      ),
      { disableLogger: true }
    )
    yield* Effect.addFinalizer(() => Effect.promise(() => app.dispose()))
    const send = (operationId: string, name: string) =>
      Effect.promise(async () => {
        const response = await app.handler(
          new Request("http://test/things", {
            method: "POST",
            headers: {
              "content-type": "application/json",
              [OPERATION_ID_HEADER]: operationId
            },
            body: encodePayload({ name })
          })
        )
        return {
          status: response.status,
          receipt: response.headers.get(SYNC_RECEIPT_HEADER),
          body: await response.text()
        }
      })
    return { runs, send }
  })

const operation = () => `op-${randomUUID()}`

describe.skipIf(!databaseUrl)("Operations middleware Postgres", () => {
  it.effect(
    "runs a retried command once and replays its response and receipt",
    () =>
      Effect.gen(function* () {
        const { projectId, userId } = yield* seed
        const { runs, send } = yield* serve(projectId, userId)
        const id = operation()

        const first = yield* send(id, "first")
        const retry = yield* send(id, "first")

        expect(runs.count).toBe(1)
        expect(first).toEqual({
          status: 200,
          receipt: `${projectId}.1.1`,
          body: '{"runs":1}'
        })
        expect(retry).toEqual(first)
      }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect("replays a declared rejection without running again", () =>
    Effect.gen(function* () {
      const { projectId, userId } = yield* seed
      const { runs, send } = yield* serve(projectId, userId)
      const id = operation()

      const first = yield* send(id, "taken")
      const retry = yield* send(id, "taken")

      expect(runs.count).toBe(1)
      expect(first.status).toBe(409)
      expect(retry).toEqual(first)
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect("lets a command that crashed run again under the same id", () =>
    Effect.gen(function* () {
      const { projectId, userId } = yield* seed
      const { runs, send } = yield* serve(projectId, userId)
      const id = operation()

      yield* send(id, "crash")
      yield* send(id, "crash")

      expect(runs.count).toBe(2)
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )

  it.effect("rejects a different request under a used id", () =>
    Effect.gen(function* () {
      const { projectId, userId } = yield* seed
      const { runs, send } = yield* serve(projectId, userId)
      const id = operation()

      yield* send(id, "first")
      const reused = yield* send(id, "second")

      expect(runs.count).toBe(1)
      expect(reused.status).toBe(409)
      expect(reused.body).toContain("operation_mismatch")
    }).pipe(Effect.provide(TestLayer), Effect.scoped)
  )
})
