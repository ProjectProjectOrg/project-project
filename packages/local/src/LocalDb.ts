import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import * as SqliteMigrator from "@effect/sql-sqlite-wasm/SqliteMigrator"
import {
  type EffectSQLiteWasmDatabase,
  makeWithDefaults
} from "drizzle-orm/effect-sqlite-wasm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Reactivity from "effect/reactivity/Reactivity"
import type * as Scope from "effect/Scope"
import * as SqlClient from "effect/sql/SqlClient"

import { localMigrations } from "./migrations"

export class LocalDb extends Context.Service<
  LocalDb,
  EffectSQLiteWasmDatabase
>()("@pp/local/LocalDb") {}

export const localDbLayer = Layer.mergeAll(
  Layer.effect(LocalDb, makeWithDefaults()),
  SqliteMigrator.layer({ loader: localMigrations })
)

export const localDatabase = <E, R>(
  client: Effect.Effect<
    SqliteClient.SqliteClient,
    E,
    R | Scope.Scope | Reactivity.Reactivity
  >
) =>
  localDbLayer.pipe(
    Layer.provideMerge(
      Layer.effectContext(
        Effect.map(client, (opened) =>
          Context.make(SqliteClient.SqliteClient, opened).pipe(
            Context.add(SqlClient.SqlClient, opened)
          )
        )
      )
    ),
    Layer.provideMerge(Reactivity.layer)
  )
