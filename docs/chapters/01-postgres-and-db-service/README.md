# Chapter 1 — Postgres, Drizzle, and a resource-managed `Db` service

## What this chapter teaches

By the end of this chapter you will have:

- A Postgres instance running in `docker compose` against your local machine.
- A TypeScript schema (`packages/backend/src/db/schema.ts`) describing one table — `project_index` — and one applied migration generated from it by `drizzle-kit`.
- A `Db` service in `packages/backend/src/services/Db.ts` that wraps the Postgres connection pool and exposes a typed Drizzle client through Effect's `Layer` system.
- A new `GET /db/ping` endpoint on `AppApi` that hits the database through the service and returns `{ projectCount: number }` — proving the whole pipeline (env var → connection pool → drizzle query → handler → response) works end-to-end.

The point isn't the endpoint. The point is the **pattern for resource-managed services in Effect** — services whose Layer needs to acquire something at startup (a TCP connection, a file handle, an HTTP keep-alive pool) and release it cleanly at shutdown. From here on, every interesting service in this app — `BetterAuth`, `Markdown`, `GitHub` — looks structurally similar to `Db`.

The Phase 1 of `docs/PROJECTPROJECT.md` calls for the full Auth flow in one go (Postgres + Better Auth + `/me` + frontend gate). We're splitting that across Chapters 1 and 2: this chapter is the database half, Chapter 2 is the Better Auth half. The split reflects how the _concepts_ land, not how short an evening it takes.

## Concepts

### 1. Why a separate `Db` service at all

A naive backend would `import pool from "./db"` from any handler that needs the database, where `pool` is a module-level connection pool. That works in JavaScript, but it has two costs that get worse as the app grows:

- **The pool's lifecycle is implicit.** When does it open? At first import. When does it close? Whenever the process dies, hopefully cleanly. There's no shutdown hook for "wait for in-flight queries to finish, drain the pool, then exit."
- **You can't swap it.** Tests that want a fake DB have to monkey-patch the import or mock at a higher layer. Code that depends on `pool` is invisibly coupled to the real Postgres.

Effect's answer is the same one it gave for `ApiClient`: make the database a **service**, declared via a Tag and produced by a Layer. Now:

- The Layer carries the lifecycle. `Layer.scoped` says "to build this service, open a connection pool; when the surrounding scope closes, drain it." `Layer.launch` (which you've already seen in `main.ts`) keeps that scope alive for as long as the server runs.
- Tests get a clean swap point: `Effect.provide(Layer.succeed(Db, fakeDb))` and the production layer never runs.
- Handlers express their dependence: a handler that says `yield* Db` is publicly admitting it needs a database. The compiler knows it; reviewers see it.

### 2. `Layer.scoped` — the resource-management primitive

You've used three Layer constructors so far:

- `Layer.succeed(Tag, value)` — wrap a plain value as a service. No setup, no teardown.
- `Layer.effect(Tag, effect)` — build the service by running an Effect. Setup happens when the layer is built; no teardown.
- `Layer.scoped(Tag, scopedEffect)` — build the service by running an Effect that's allowed to use `Effect.acquireRelease(...)` or yield from a `Scope`. Setup AND teardown.

The first two are appropriate for stateless services. The third is what databases want. Crucially, you don't usually write `Layer.scoped` yourself — libraries that own resources (like `@effect/sql-pg`) hand you a layer that's already scoped. You compose it the same way you'd compose any other layer.

> **What is a "scope"?** A `Scope` is just a list of finalizers. When the scope closes, finalizers run in reverse order — LIFO, so things release in the reverse order they were acquired. In our app, the top-level Scope is opened by `Layer.launch(ServerLive)` in `main.ts` and stays open for the lifetime of the process. When you Ctrl+C the server, `BunRuntime.runMain` interrupts that scope, finalizers run, and the connection pool drains.

### 3. The Effect SQL stack

Three packages, layered:

```
packages/backend/src/services/Db.ts   ← yields PgDrizzle
                    |
      `layer` from @effect/sql-drizzle/Pg
                    |
                    v
      PgClient.layerConfig (@effect/sql-pg)
                    |
                    v
           pg (node-postgres) pool
                    |
                    v
              Postgres on :5432
```

What each does:

- **`pg`** — the actual TCP driver and connection pool. We never import it directly; `@effect/sql-pg` does.
- **`@effect/sql`** — the core. Defines the `Client` interface (a generic SQL execution surface), error types (`SqlError`), the migrator, the parameterized-query helpers. You'll touch its `sql` template tag if you want to drop to raw SQL, but mostly you'll stay one level up.
- **`@effect/sql-pg`** — the Postgres-flavored implementation of `@effect/sql`. `PgClient.layerConfig({ url })` returns `Layer<PgClient | SqlClient, SqlError>`. The pool is acquired when the layer is built and released when the scope closes.
- **`@effect/sql-drizzle`** — adapts `drizzle-orm` to use the `@effect/sql` Client underneath instead of its own driver. Gives you the `PgDrizzle` Tag (a `Context.TagClass`) and a top-level `layer` export of type `Layer<PgDrizzle, never, SqlClient>`. (Note: `layer` is a sibling export of the module, not a property of the `PgDrizzle` class — easy to miss on first read of the types.)
- **`drizzle-orm`** — the typed query builder. You write `db.select().from(projectIndex)` and it produces a SQL statement plus a runtime decoder that types the rows as `{ slug: string, ownerId: string, createdAt: Date }`.
- **`drizzle-kit`** — the _tooling_ sibling. Reads your TypeScript schema and emits SQL migrations. Never runs in production; it's a dev-time CLI.

You'll use Drizzle ORM at runtime; you'll use drizzle-kit at the command line.

### 4. Why use Drizzle at all instead of raw `@effect/sql`?

`@effect/sql` is perfectly capable of running queries on its own — `sql\`SELECT * FROM project_index\`` returns an Effect that yields rows. So why drag in another library?

Two reasons:

- **Schema-as-types.** With Drizzle, the column shape lives in `schema.ts` and flows into every query and every result type. With raw SQL, you write the row type by hand wherever you decode results, and they drift.
- **Migration tooling.** drizzle-kit generates SQL migrations by diffing your schema file against the previous state. You could write migrations by hand, but you'd duplicate every column definition between schema and migration.

The cost: a thin wrapper between you and SQL. For 95% of queries this is invisible; for the 5% where you need a Postgres-specific feature Drizzle doesn't expose, you can always drop down to raw `@effect/sql` for that one query.

### 5. `Config.redacted` — secrets at the boundary

Database URLs contain passwords. `Config.redacted("DATABASE_URL")` reads `process.env.DATABASE_URL` and wraps it in `Redacted<string>` — a type whose `.toString()` returns `<redacted>` instead of the actual value. If a stack trace ever serializes the connection string, you get `<redacted>` in your logs instead of credentials.

`PgClient.layerConfig({ url: Config.redacted("DATABASE_URL") })` accepts the redacted form. The driver unwraps it internally where it's actually needed, but it's never sitting in plain text in your application code. Worth getting in the habit of now — every secret in this app will follow the same pattern.

### 6. Drizzle queries are Effects (the invisible seam)

Drizzle's runtime API was designed around Promises — `db.select().from(table)` returns a thenable that resolves with rows. But `@effect/sql-drizzle` does a small piece of magic via TypeScript module augmentation:

```ts
// inside @effect/sql-drizzle/Pg
declare module "drizzle-orm" {
  interface QueryPromise<T> extends Effect.Effect<T, SqlError> {}
}
```

That declaration tells TypeScript that every Drizzle query (which extends `QueryPromise`) is _also_ an `Effect.Effect<T, SqlError>`. At runtime, the same query object satisfies both interfaces — under `await` it acts like a Promise, under `yield*` inside `Effect.gen` it acts like an Effect. So you write:

```ts
Effect.gen(function*() {
  const db = yield* Db
  const rows = yield* db.select().from(projectIndex)
  return rows
})
```

…with no `Effect.promise(() => ...)` wrapper. The error path is typed as `SqlError`, which surfaces in your handler's `E` channel automatically.

This is one of the seams where Effect meets a Promise-based library. The pattern won't always work this cleanly — for libraries that _don't_ ship Effect-aware module augmentation (Better Auth in Chapter 2, Octokit later), you'll wrap calls with `Effect.tryPromise(...)` and provide a `catch` mapper to map errors into your tagged error types. Drizzle's choice to augment its types means the wrapper isn't needed; you just `yield*` queries directly.

## Further reading

- `@effect/sql` overview: <https://effect.website/docs/sql/introduction/>
- Drizzle ORM (Postgres): <https://orm.drizzle.team/docs/get-started-postgresql>
- drizzle-kit migrations: <https://orm.drizzle.team/docs/migrations>
- Effect's `Scope` and resource management: <https://effect.website/docs/resource-management/scope/>
- Effect `Config` module: <https://effect.website/docs/configuration/>
- node-postgres (`pg`) connection pooling notes: <https://node-postgres.com/features/pooling>
- Postgres docker image: <https://hub.docker.com/_/postgres>

## Exercises

1. [Postgres in docker compose](./exercises/01-postgres-in-compose.md) — get the database running locally.
2. [The schema](./exercises/02-drizzle-schema.md) — describe `project_index` as TypeScript.
3. [The first migration](./exercises/03-first-migration.md) — generate and apply SQL with drizzle-kit.
4. [The `Db` service](./exercises/04-db-service.md) — wrap the connection pool as an Effect Layer.
5. [Smoke endpoint](./exercises/05-smoke-endpoint.md) — `GET /db/ping` proves the loop closes.
