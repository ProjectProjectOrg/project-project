import { make } from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"
import * as Config from "effect/Config"
import * as Layer from "effect/Layer"
import * as schema from "../db/schema"
import { Db } from "../Services/Db"

export const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL")
})

export const DbLive = Layer.effect(Db, make({ schema })).pipe(
  Layer.provide(PgLive)
)
