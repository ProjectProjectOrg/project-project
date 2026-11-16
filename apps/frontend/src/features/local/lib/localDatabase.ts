import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { localDatabase } from "@pp/local"
import * as Effect from "effect/Effect"

import { openOpfs } from "./opfsSqlite"

const LEGACY_POOL = "opfs"

const opfsAvailable = () =>
  "locks" in navigator &&
  "storage" in navigator &&
  "getDirectory" in navigator.storage

const removeLegacyPool = Effect.promise(() =>
  navigator.storage
    .getDirectory()
    .then((root) => root.removeEntry(LEGACY_POOL, { recursive: true }))
    .catch(() => undefined)
)

const inMemory = (reason: string) =>
  Effect.logInfo(`local copy kept in memory: ${reason}`).pipe(
    Effect.andThen(SqliteClient.makeMemory({}))
  )

const tuned = (sql: SqliteClient.SqliteClient) =>
  Effect.all([
    sql`pragma page_size = 65536`,
    sql`pragma cache_size = -131072`,
    sql`pragma journal_mode = delete`,
    sql`pragma temp_store = memory`
  ])

const open = (userId: string) =>
  Effect.gen(function* () {
    if (!opfsAvailable()) return yield* inMemory("no OPFS in this browser")
    yield* removeLegacyPool
    return yield* openOpfs(`/local/pp-${userId}.sqlite`).pipe(
      Effect.tap(tuned),
      Effect.tap(() => Effect.logInfo("local copy persisted in OPFS")),
      Effect.catchCause((cause) =>
        Effect.logWarning("local copy could not open OPFS", cause).pipe(
          Effect.andThen(inMemory("OPFS failed"))
        )
      )
    )
  })

export const localDatabaseLayer = (userId: string) =>
  localDatabase(open(userId))
