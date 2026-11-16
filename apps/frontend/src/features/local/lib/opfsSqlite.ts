import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import * as WaSqlite from "@effect/wa-sqlite"
import SQLiteESMFactory from "@effect/wa-sqlite/dist/wa-sqlite.mjs"
import { AccessHandlePoolVFS } from "@effect/wa-sqlite/src/examples/AccessHandlePoolVFS.js"
import * as Effect from "effect/Effect"
import * as Predicate from "effect/Predicate"
import * as Semaphore from "effect/Semaphore"
import * as Client from "effect/sql/SqlClient"
import type { Connection } from "effect/sql/SqlConnection"
import { classifySqliteError, SqlError } from "effect/sql/SqlError"
import * as Statement from "effect/sql/Statement"
import * as Stream from "effect/Stream"

type Row = Record<string, SQLiteCompatibleType>

const failure = (operation: string) => (cause: unknown) =>
  new SqlError({
    reason: classifySqliteError(cause, {
      message: `SQLite ${operation} failed`,
      operation
    })
  })

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- this is the parse: the SQL compiler hands the driver untyped parameters
const bindable = (value: unknown): SQLiteCompatibleType => {
  if (
    value === null ||
    Predicate.isString(value) ||
    Predicate.isNumber(value) ||
    Predicate.isBigInt(value) ||
    value instanceof Uint8Array
  )
    return value
  if (Predicate.isBoolean(value)) return value ? 1 : 0
  throw new TypeError("SQLite cannot bind this parameter")
}

const toObject = ({
  columns,
  values
}: Readonly<{
  columns: ReadonlyArray<string>
  values: ReadonlyArray<SQLiteCompatibleType>
}>): Row => Object.fromEntries(columns.map((c, i) => [c, values[i] ?? null]))

export const openOpfs = (dbName: string) =>
  Effect.gen(function* () {
    const module = yield* Effect.promise(() => SQLiteESMFactory())
    const sqlite3 = WaSqlite.Factory(module)
    const vfs = yield* Effect.acquireRelease(
      Effect.promise(() => AccessHandlePoolVFS.create("opfs", module)),
      (pool) => Effect.promise(() => Promise.resolve(pool.close()))
    )
    sqlite3.vfs_register(vfs, false)
    const db = yield* Effect.acquireRelease(
      Effect.try({
        try: () => sqlite3.open_v2(dbName, undefined, "opfs"),
        catch: failure("openDatabase")
      }),
      (handle) => Effect.sync(() => sqlite3.close(handle))
    )

    function* rows(sql: string, params: ReadonlyArray<unknown>) {
      for (const stmt of sqlite3.statements(db, sql)) {
        let columns: Array<string> | undefined
        sqlite3.bind_collection(stmt, params.map(bindable))
        while (sqlite3.step(stmt) === WaSqlite.SQLITE_ROW) {
          columns ??= sqlite3.column_names(stmt)
          yield { columns, values: sqlite3.row(stmt) }
        }
      }
    }
    const run = (sql: string, params: ReadonlyArray<unknown> = []) =>
      Effect.try({
        try: () => Array.from(rows(sql, params), toObject),
        catch: failure("execute")
      })
    const runValues = (sql: string, params: ReadonlyArray<unknown> = []) =>
      Effect.try({
        try: () => Array.from(rows(sql, params), (row) => row.values),
        catch: failure("execute")
      })

    const connection: Connection = {
      execute: (sql, params, transformRows) =>
        transformRows
          ? Effect.map(run(sql, params), transformRows)
          : run(sql, params),
      executeRaw: run,
      executeValues: runValues,
      executeValuesUnprepared: runValues,
      executeUnprepared: (sql, params, transformRows) =>
        transformRows
          ? Effect.map(run(sql, params), transformRows)
          : run(sql, params),
      executeStream: (sql, params, transformRows) =>
        Stream.unwrap(
          Effect.map(run(sql, params), (objects) =>
            Stream.fromIterable(
              transformRows ? transformRows(objects) : objects
            )
          )
        )
    }

    const { acquirer, borrower, onCommitFailure, transactionAcquirer } =
      Client.makeSqliteAcquirers({
        connection: Effect.succeed(connection),
        semaphore: yield* Semaphore.make(1),
        isTransaction: () => sqlite3.get_autocommit(db) === 0
      })
    const client = yield* Client.make({
      acquirer,
      borrower,
      compiler: Statement.makeCompilerSqlite(),
      transactionAcquirer,
      onCommitFailure,
      releaseSavepoint: (name) => `RELEASE SAVEPOINT ${name}`,
      spanAttributes: [["db.system.name", "sqlite"]]
    })
    const exported = Effect.try({
      try: () => sqlite3.serialize(db, "main"),
      catch: failure("export")
    })
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- SqliteClient marks updateValues as never; the library builds its own client the same way
    return Object.assign(client, {
      [SqliteClient.TypeId]: SqliteClient.TypeId,
      config: {},
      export: exported,
      import: (data: Uint8Array) =>
        Effect.try({
          try: () => {
            sqlite3.deserialize(
              db,
              "main",
              data,
              data.length,
              data.length,
              1 | 2
            )
          },
          catch: failure("import")
        })
    }) as SqliteClient.SqliteClient
  })
