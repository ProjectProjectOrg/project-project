# Exercise 4 — The `Db` service

**File to edit:** `packages/backend/src/services/Db.ts`

## Goal

Wire up the `Db` service: a thin re-export of `@effect/sql-drizzle`'s `PgDrizzle` Tag, with a Layer (`DbLive`) that builds the connection pool from `DATABASE_URL` and stacks the Drizzle adapter on top. Once this is in place, any handler can `yield* Db` and get a typed Drizzle client.

## Concepts practiced

- Composing two Layers with `Layer.provide` (Drizzle on top, Postgres underneath)
- `Config.redacted(...)` for environment-sourced secrets
- Re-exporting library Tags so consumers have one import path
- Why we use `Context.Tag`-style declarations (via `PgDrizzle`) rather than `Effect.Service` for this — even though we wrote it ourselves, the _interface_ (the Drizzle `db` client) is owned by another library

## Steps

1. Open `packages/backend/src/services/Db.ts`. Read the top comment block — it lays out the stack and the why-not-`Effect.Service` reasoning.
2. Add the imports:
   ```ts
   import { PgClient } from "@effect/sql-pg"
   import { layer as PgDrizzleLayer, PgDrizzle } from "@effect/sql-drizzle/Pg"
   import { Config, Layer } from "effect"
   ```
3. Build the Postgres pool layer:
   ```ts
   export const PgLive = PgClient.layerConfig({
     url: Config.redacted("DATABASE_URL")
   })
   ```
4. Build the Drizzle layer on top:
   ```ts
   export const DbLive = PgDrizzleLayer.pipe(Layer.provide(PgLive))
   ```
5. Re-export the Tag so consumers have a single import:
   ```ts
   export { PgDrizzle as Db }
   ```
6. Delete the `export {}` placeholder.
7. Run `bun run --filter @projectproject/backend typecheck`. It should pass — even though the layer hasn't been provided to anything yet.

## Acceptance criteria

- [ ] The file exports `PgLive`, `DbLive`, and `Db`.
- [ ] Hovering `DbLive` shows roughly `Layer<PgDrizzle, ConfigError | SqlError, never>` — i.e. the connection pool's `RIn` is empty (the URL came from Config), but the layer can fail with `ConfigError` (env var missing) or `SqlError` (connection refused, auth failed, etc.) at build time.
- [ ] Hovering `Db` shows it's a `Context.Tag`. Importing `Db` from this file in another file works for `yield* Db`.

## Hints

<details>
<summary>Hint 1 — full file body (after the comment block)</summary>

```ts
import { PgClient } from "@effect/sql-pg"
import { layer as PgDrizzleLayer, PgDrizzle } from "@effect/sql-drizzle/Pg"
import { Config, Layer } from "effect"

export const PgLive = PgClient.layerConfig({
  url: Config.redacted("DATABASE_URL")
})

export const DbLive = PgDrizzleLayer.pipe(Layer.provide(PgLive))

export { PgDrizzle as Db }
```

</details>

<details>
<summary>Hint 2 — why isn't the URL just a string here?</summary>

`PgClient.layerConfig` takes a `Config.Config.Wrap<PgClientConfig>` — a _plan_ for resolving config from the environment. The plain `PgClient.layer({ url: "postgres://..." })` exists too and accepts a literal string, but then your URL (with password) is sitting in source code. `Config.redacted(...)` reads from `process.env`, gives you a `Redacted<string>` whose `toString()` is `<redacted>`, and lets the layer fail with a typed `ConfigError` if `DATABASE_URL` is missing instead of a runtime `undefined` deep in the driver.

This is the same pattern you'll use for `BETTER_AUTH_SECRET`, `GITHUB_CLIENT_ID`, etc. in later chapters.

</details>

<details>
<summary>Hint 3 — what's actually in <code>DbLive</code>'s scope?</summary>

When `DbLive` is built (because something `provide`s it), here's what happens:

1. The Layer machinery sees that the drizzle `layer` requires a `SqlClient`.
2. It looks up the chain — `Layer.provide(PgLive)` says "PgLive provides what's missing."
3. `PgLive` (`PgClient.layerConfig(...)`) opens a connection pool against the URL from `Config.redacted("DATABASE_URL")`. This pool is registered with the surrounding `Scope`.
4. the drizzle `layer` wraps the pool's `SqlClient` with the Drizzle adapter and emits a `PgDrizzle` value.

When the surrounding scope closes (Ctrl+C in `main.ts`, end of test in `vitest`), the pool is drained — connections `.end()` is called, in-flight queries are awaited, the resource is released. You wrote zero finalizer code; the Layer system did it for you. That's the whole point of `Layer.scoped` (which `PgClient.layerConfig` is built on internally).

</details>
