import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { localDatabase } from "@pp/local"
import * as Effect from "effect/Effect"

import { openOpfs } from "./opfsSqlite"

const PERSISTED_LOCK = "pp-local"
const LOCK_WAIT_MS = 3000

const opfsAvailable = () =>
  "locks" in navigator &&
  "storage" in navigator &&
  "getDirectory" in navigator.storage

const claimPersistence = Effect.acquireRelease(
  Effect.callback<(() => void) | null>((resume) => {
    navigator.locks
      .request(
        PERSISTED_LOCK,
        { signal: AbortSignal.timeout(LOCK_WAIT_MS) },
        () =>
          new Promise<void>((release) => {
            resume(Effect.succeed(() => release()))
          })
      )
      .catch(() => resume(Effect.succeed(null)))
  }),
  (release) => Effect.sync(() => release?.())
)

const inMemory = (reason: string) =>
  Effect.logInfo(`local copy kept in memory: ${reason}`).pipe(
    Effect.andThen(SqliteClient.makeMemory({}))
  )

const open = (userId: string) =>
  Effect.gen(function* () {
    if (!opfsAvailable()) return yield* inMemory("no OPFS in this browser")
    const release = yield* claimPersistence
    if (release === null) return yield* inMemory("another tab holds the file")
    return yield* openOpfs(`pp-${userId}.sqlite`).pipe(
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
      sql`pragma page_size = 65536`,
      sql`pragma cache_size = -131072`,
      sql`pragma journal_mode = truncate`
    ])
  )

export const localDatabaseLayer = (userId: string) =>
  localDatabase(tuned(userId))
