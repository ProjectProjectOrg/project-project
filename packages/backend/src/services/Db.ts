import { PgClient } from "@effect/sql-pg"
import { make } from "@effect/sql-drizzle/Pg"
import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import { Config, Context, Layer } from "effect"
import * as schema from "../db/schema"

type Schema = typeof schema

export class Db extends Context.Tag("Db")<Db, PgRemoteDatabase<Schema>>() {}

export const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL")
})

export const DbLive = Layer.effect(Db, make({ schema })).pipe(
  Layer.provide(PgLive)
)
