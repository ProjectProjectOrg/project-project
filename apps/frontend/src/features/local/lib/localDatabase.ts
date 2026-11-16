import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { localDbLayer } from "@pp/local"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

const PERSISTED_LOCK = "pp-local"
const WORKER_READY_TIMEOUT = "5 seconds"

const opfsAvailable = () =>
  "Worker" in globalThis &&
  "locks" in navigator &&
  "storage" in navigator &&
  "getDirectory" in navigator.storage

const claimPersistence = Effect.acquireRelease(
  Effect.callback<(() => void) | null>((resume) => {
    void navigator.locks.request(
      PERSISTED_LOCK,
      { ifAvailable: true },
      (lock) =>
        new Promise<void>((release) => {
          if (lock === null) {
            resume(Effect.succeed(null))
            release()
          } else resume(Effect.succeed(() => release()))
        })
    )
  }),
  (release) => Effect.sync(() => release?.())
)

const openWorker = (dbName: string) =>
  Effect.acquireRelease(
    Effect.sync(() => {
      const worker = new Worker(new URL("./sqliteWorker.ts", import.meta.url), {
        type: "module",
        name: "pp-local"
      })
      const channel = new MessageChannel()
      worker.postMessage(dbName, [channel.port2])
      return { worker, port: channel.port1 }
    }),
    ({ worker }) => Effect.sync(() => worker.terminate())
  ).pipe(Effect.map(({ port }) => port))

const persisted = (userId: string) =>
  SqliteClient.make({
    worker: openWorker(`pp-${userId}.sqlite`),
    installReactivityHooks: true
  }).pipe(Effect.timeout(WORKER_READY_TIMEOUT))

const memory = SqliteClient.makeMemory({ installReactivityHooks: true })

const inMemory = (reason: string) =>
  Effect.logInfo(`local copy kept in memory: ${reason}`).pipe(
    Effect.andThen(memory)
  )

const open = (userId: string) =>
  Effect.gen(function* () {
    if (!opfsAvailable()) return yield* inMemory("no OPFS in this browser")
    const release = yield* claimPersistence
    if (release === null) return yield* inMemory("another tab holds the file")
    return yield* persisted(userId).pipe(
      Effect.tap(() => Effect.logInfo("local copy persisted in OPFS")),
      Effect.catchCause((cause) =>
        Effect.logWarning("local copy could not open OPFS", cause).pipe(
          Effect.andThen(inMemory("OPFS failed"))
        )
      )
    )
  })

const tuned = (userId: string) =>
  Effect.tap(open(userId), (sql) =>
    Effect.all([
      sql`pragma cache_size = -131072`,
      sql`pragma journal_mode = truncate`
    ])
  )

const clientLayer = (userId: string) =>
  Layer.effectContext(
    Effect.map(tuned(userId), (client) =>
      Context.make(SqliteClient.SqliteClient, client).pipe(
        Context.add(SqlClient.SqlClient, client)
      )
    )
  )

export const localDatabaseLayer = (userId: string) =>
  localDbLayer.pipe(Layer.provideMerge(clientLayer(userId)))
