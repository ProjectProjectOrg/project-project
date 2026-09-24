import { PgClient } from "@effect/sql-pg"
import { makeWithDefaults } from "drizzle-orm/effect-postgres"
import * as Config from "effect/Config"
import * as Layer from "effect/Layer"

import { Db } from "./Db"
import { relations } from "./schema"

export const PgLive = PgClient.layerConfig({
  url: Config.Redacted("DATABASE_URL")
})

export const DbLive = Layer.effect(Db, makeWithDefaults({ relations }))
