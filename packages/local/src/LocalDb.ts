import * as SqliteMigrator from "@effect/sql-sqlite-wasm/SqliteMigrator"
import {
  type EffectSQLiteWasmDatabase,
  makeWithDefaults
} from "drizzle-orm/effect-sqlite-wasm"
import * as Context from "effect/Context"
import * as Layer from "effect/Layer"

import { localMigrations } from "./migrations"

export class LocalDb extends Context.Service<
  LocalDb,
  EffectSQLiteWasmDatabase
>()("@pp/local/LocalDb") {}

export const localDbLayer = Layer.mergeAll(
  Layer.effect(LocalDb, makeWithDefaults()),
  SqliteMigrator.layer({ loader: localMigrations })
)
