import { PgClient } from "@effect/sql-pg"
import * as PgTypes from "@effect/sql-pg/PgTypes"
import { makeWithDefaults } from "drizzle-orm/effect-postgres"
import * as Config from "effect/Config"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"

import { Db } from "./Db"
import { relations } from "./schema"

export const pgTypes = PgTypes.makeRegistry()

pgTypes.register(2278, {
  encode: () => Result.succeed(new Uint8Array()),
  decode: () => Result.succeed(undefined)
})

export const PgLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL"),
  types: Config.succeed(pgTypes)
})

export const DbLive = Layer.effect(Db, makeWithDefaults({ relations }))
