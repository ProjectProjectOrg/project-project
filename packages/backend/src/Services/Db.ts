import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import * as Context from "effect/Context"
import * as schema from "../db/schema"

type Schema = typeof schema

export class Db extends Context.Tag("@projectproject/backend/Services/Db")<
  Db,
  PgRemoteDatabase<Schema>
>() {}
