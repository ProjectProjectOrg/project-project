import type { PgRemoteDatabase } from "drizzle-orm/pg-proxy"
import { Context } from "effect"
import * as schema from "../db/schema"

type Schema = typeof schema

export class Db extends Context.Tag("Db")<Db, PgRemoteDatabase<Schema>>() {}
