// packages/backend/src/services/Db.ts
//
// THE Db SERVICE — RESOURCE-MANAGED LAYER FOR POSTGRES + DRIZZLE.
// ============================================================================
// This is the first service we *don't* get to declare with `Effect.Service`.
// It's also the first one whose Layer wraps a *resource* — a Postgres
// connection pool that needs to be acquired at startup and released cleanly
// at shutdown.
//
// THE STACK
// ----------------------------------------------------------------------------
// Two libraries do the work, and one Effect package glues them:
//
//   - `pg` (node-postgres): the actual TCP-level Postgres driver. Connection
//     pool, wire protocol, the whole thing.
//   - `drizzle-orm`: the ergonomic typed query builder. Reads your schema
//     (`src/db/schema.ts`), gives you `db.select().from(table)` etc.
//   - `@effect/sql-pg`: provides `PgClient` — a pool managed as an Effect
//     resource. Acquires connections lazily, releases them when the
//     containing Scope closes.
//   - `@effect/sql-drizzle`: provides `PgDrizzle` — a Drizzle client whose
//     queries dispatch through the `@effect/sql` `Client` underneath. Lets
//     Drizzle calls compose into Effect programs.
//
// You'll think in two layers:
//
//                          drizzle `layer`        <- the drizzle client
//                                |
//                                v
//                         PgClient.layerConfig    <- the pg pool
//                                |
//                                v
//                          DATABASE_URL           <- from .env
//
// `Layer.provide(PgLive)` wires the drizzle layer on top of the pg layer.
//
// CONFIG VS HARD-CODED VALUES
// ----------------------------------------------------------------------------
// `PgClient.layerConfig` takes a `Config.Config.Wrap<PgClientConfig>` — i.e.
// a plan for *resolving* the config from the environment at layer-build time.
// `Config.redacted("DATABASE_URL")` reads `process.env.DATABASE_URL` and wraps
// it in `Redacted<string>` so it can't accidentally be logged in plain text.
//
// Where does `process.env.DATABASE_URL` come from? Bun's `--env-file` flag
// in the dev/start scripts (`packages/backend/package.json`) points at the
// repo-root `.env`. drizzle-kit gets the same env via an explicit
// `dotenv` load in `drizzle.config.ts`. One `.env` file, two consumers,
// each loading it deliberately rather than relying on Bun's "auto-load
// from cwd" — which doesn't walk up the directory tree.
//
// You could also use `PgClient.layer({ url: "..." })` with a plain string for
// quick experiments — but for anything that ships, use the Config-resolved
// variant. It also gives you a typed failure path (`ConfigError`) if the env
// var is missing, instead of a silent `undefined`.
//
// WHY WE'RE NOT USING `Effect.Service` HERE
// ----------------------------------------------------------------------------
// `Effect.Service` is great when *you're* the one declaring a service from
// scratch (Chapter 2's `Markdown` will use `Context.Tag`-style declarations
// with hand-written interfaces). For `Db`, we're just *re-exporting* layers
// the Effect SQL packages already give us. There's no new service to declare:
// `PgDrizzle` is itself a `Context.TagClass` exported by `@effect/sql-drizzle/Pg`.
// We compose its layer with the pg pool layer and re-export the bundle.
//
// CHAPTER 1 STEPS
// ----------------------------------------------------------------------------
//   1. Imports — note that `layer` is a *top-level export* of the module,
//      not a property of the `PgDrizzle` class. We import it as a renamed
//      named import to keep call sites readable:
//        import { PgClient } from "@effect/sql-pg"
//        import { layer as PgDrizzleLayer, PgDrizzle } from "@effect/sql-drizzle/Pg"
//        import { Config, Layer } from "effect"
//
//   2. Build the pg pool layer:
//        export const PgLive = PgClient.layerConfig({
//          url: Config.redacted("DATABASE_URL"),
//        })
//
//   3. Build the drizzle layer on top of it:
//        export const DbLive = PgDrizzleLayer.pipe(Layer.provide(PgLive))
//
//   4. Re-export the Tag so consumers have one import:
//        export { PgDrizzle as Db }
//
//      (The Tag has no `Live` suffix in its name; the Layer does. So
//      `yield* Db` and `Layer.provide(DbLive)` is the convention.)
//
// HOW YOU'LL USE IT
// ----------------------------------------------------------------------------
//   import { Db } from "../services/Db"
//   import { projectIndex } from "../db/schema"
//
//   const program = Effect.gen(function*() {
//     const db = yield* Db                                  // the drizzle client
//     const rows = yield* db.select().from(projectIndex)    // already an Effect!
//     return rows
//   })
//
// Why no `Effect.promise(...)` wrapper? `@effect/sql-drizzle` augments
// drizzle-orm's `QueryPromise` interface so it *also* extends `Effect.Effect`.
// That means a Drizzle query is both a thenable (you could `await` it under
// node-postgres) AND an Effect — `yield* db.select()...` works directly,
// with errors typed as `SqlError`. The seam is invisible: you write Drizzle
// queries the way the Drizzle docs show you, but they compose as Effects.

import { PgClient } from "@effect/sql-pg"
import { layer as PgDrizzleLayer, PgDrizzle } from "@effect/sql-drizzle/Pg"
import { Config, Layer } from "effect"

export const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL")
})

export const DbLive = PgDrizzleLayer.pipe(Layer.provide(PgLive))

export { PgDrizzle as Db }
