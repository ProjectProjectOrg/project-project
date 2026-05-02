# Exercise 5 — Smoke endpoint: `GET /db/ping`

**Files to edit:** `packages/shared/src/api.ts`, `packages/backend/src/main.ts`.

## Goal

Add a new endpoint `GET /db/ping` to the contract that returns `{ projectCount: number }`, implement it on the backend by counting rows in `project_index`, and verify the whole pipeline end-to-end. This is Chapter 1's payoff: the Db Layer flows through the same wiring `HealthHandlerLive` already uses, just with an extra dependency in its `R` channel.

## Concepts practiced

- Adding a second `HttpApiGroup` to `AppApi`
- Composing handlers that depend on services (`yield* Db`)
- Passing `DbLive` into `ApiLive` via `Layer.provide`
- Watching the type system enforce the dependency: a handler that yields `Db` _requires_ `DbLive` to be provided somewhere upstream, or the program won't compile

## Steps

### Part A — extend the contract

1. Open `packages/shared/src/api.ts`.
2. Define a new response schema:
   ```ts
   const DbPingResponse = Schema.Struct({
     projectCount: Schema.Number
   })
   export type DbPingResponse = typeof DbPingResponse.Type
   ```
3. Add a new group with one endpoint:
   ```ts
   const DbGroup = HttpApiGroup
     .make("db")
     .add(
       HttpApiEndpoint.get("ping", "/db/ping").addSuccess(DbPingResponse)
     )
   ```
4. Mount the group on `AppApi`:
   ```ts
   export const AppApi = HttpApi
     .make("projectproject")
     .add(HealthGroup)
     .add(DbGroup)
   ```
5. Run typecheck. The frontend may now report an unused-export warning for the new `DbPingResponse` type — that's fine, we'll use it in the next chapter.

### Part B — implement the handler

1. Open `packages/backend/src/main.ts`.
2. Import the schema and the Db service:
   ```ts
   import { Db, DbLive } from "./services/Db"
   import { projectIndex } from "./db/schema"
   import { count } from "drizzle-orm"
   ```
3. Define the new handler group, alongside `HealthHandlerLive`:
   ```ts
   export const DbHandlerLive = HttpApiBuilder.group(
     AppApi,
     "db",
     (handlers) =>
       handlers.handle("ping", () =>
         Effect
           .gen(function*() {
             const db = yield* Db
             const [{ value }] = yield* db.select({ value: count() }).from(
               projectIndex
             )
             return { projectCount: value }
           })
           .pipe(Effect.orDie))
   )
   ```
   Notice the shape:
   - `yield* Db` pulls the Drizzle client out of the `R` channel.
   - `db.select({ value: count() }).from(projectIndex)` is a typed Drizzle query — `count()` from `drizzle-orm` produces `{ value: number }` rows; we destructure the single returned row.
   - The query is `yield*`-ed directly — no `Effect.promise(...)` wrapper. `@effect/sql-drizzle` augments Drizzle's `QueryPromise` to also extend `Effect.Effect`, so the same value works as both a Promise and an Effect. Errors come back typed as `SqlError`.
   - **The `.pipe(Effect.orDie)` matters.** A Drizzle query carries `SqlError` in its `E` channel, but our endpoint declared no `.addError(...)`. HttpApi rejects any handler whose `E` channel doesn't match the contract. `Effect.orDie` says "if this fails, treat it as a defect" — the client gets a generic 500, the error shows in server logs, but it isn't part of the contract. Right call for `/db/ping` because the only failure modes are infrastructure (DB down, pool drained), and the client can't usefully discriminate them. If you wanted the client to branch on a specific failure (e.g. "not found"), you'd `.addError(NotFound)` on the endpoint and let the typed error flow through.
4. Provide the new handler in `ApiLive`:
   ```ts
   export const ApiLive = HttpApiBuilder.api(AppApi).pipe(
     Layer.provide(HealthHandlerLive),
     Layer.provide(DbHandlerLive)
   )
   ```
   (Multiple `Layer.provide` in a `pipe` is sugar for "all of these are dependencies." Order doesn't matter for distinct services.)
5. Provide `DbLive` to `ServerLive`:
   ```ts
   const ServerLive = HttpApiBuilder.serve().pipe(
     Layer.provide(ApiLive),
     Layer.provide(DbLive),
     Layer.provide(BunHttpServer.layer({ port: 3000 }))
   )
   ```
   This is where the lifecycle of the connection pool gets attached to the lifecycle of the server. When `Layer.launch(ServerLive)` opens its scope, `DbLive` opens the pool. When the scope closes (Ctrl+C), the pool drains.

### Part C — verify

1. Make sure Postgres is running (`docker compose ps`).
2. Make sure the migration has been applied (run `bun run --filter @projectproject/backend db:migrate` if you're not sure).
3. Start the backend: `bun run --filter @projectproject/backend dev`.
4. From another terminal:
   ```sh
   curl http://localhost:3000/db/ping
   ```
   You should get `{"projectCount":0}` — empty table, zero rows.
5. Manually insert a row to prove the count moves:
   ```sh
   docker compose exec postgres psql -U projectproject -d projectproject \
     -c "INSERT INTO project_index (slug, owner_id) VALUES ('test', 'user-1');"
   ```
6. Curl again. You should get `{"projectCount":1}`.

## Acceptance criteria

- [ ] `curl http://localhost:3000/db/ping` returns `{"projectCount":N}` where `N` matches the row count in `project_index`.
- [ ] If you forget `Layer.provide(DbLive)` in `ServerLive`, TypeScript refuses to compile — you'll see an error mentioning `PgDrizzle` (or `Db`) is still in the requirement channel. Try it; restore.
- [ ] Stopping the backend with Ctrl+C exits cleanly without printing connection-pool errors. (If it does print errors, the scope closure isn't reaching the pool — say something and we'll debug.)
- [ ] If you stop Postgres (`docker compose stop postgres`) and then start the backend, the backend should fail at startup (during `Layer.launch`) with a `SqlError`, not silently start and fail per-request. That's `DbLive`'s build-time failure mode doing its job — fail fast.

## Hints

<details>
<summary>Hint 1 — what does <code>count()</code> return exactly?</summary>

`count()` from `drizzle-orm` is a SQL aggregate. `db.select({ value: count() }).from(projectIndex)` produces a query whose result type is `Array<{ value: number }>` — always one row, with the count under whatever key you named it (`value` here; could be anything). You destructure: `const [{ value }] = ...rows`.

If you want it to also count a specific column (e.g. for `COUNT(slug)` instead of `COUNT(*)`), pass a column reference: `count(projectIndex.slug)`.

</details>

<details>
<summary>Hint 2 — why is the requirement on <code>Db</code> visible at type level?</summary>

`HttpApiBuilder.group(AppApi, "db", (handlers) => ...)` infers each handler's `R` channel and aggregates them into the group's `R`. If your handler does `yield* Db`, the group's Layer carries `Db` in its `RIn`. `HttpApiBuilder.api(AppApi).pipe(Layer.provide(DbHandlerLive))` then surfaces that as part of `ApiLive`'s `RIn`. Eventually `Layer.launch(ServerLive)` requires `RIn = never`, so anything not provided in the chain becomes a compile error.

This is the dependency graph from Chapter 0's concept §2 paying off in practice. Every handler's needs are tracked through the type system end-to-end, and the compiler refuses to start a server that's missing a service.

</details>

<details>
<summary>Hint 3 — full additions to main.ts</summary>

```ts
// at the top, alongside other imports
import { count } from "drizzle-orm"
import { projectIndex } from "./db/schema"
import { Db, DbLive } from "./services/Db"

// alongside HealthHandlerLive
export const DbHandlerLive = HttpApiBuilder.group(
  AppApi,
  "db",
  (handlers) =>
    handlers.handle("ping", () =>
      Effect.gen(function*() {
        const db = yield* Db
        const [{ value }] = yield* db.select({ value: count() }).from(
          projectIndex
        )
        return { projectCount: value }
      }))
)

// updated ApiLive
export const ApiLive = HttpApiBuilder.api(AppApi).pipe(
  Layer.provide(HealthHandlerLive),
  Layer.provide(DbHandlerLive)
)

// updated ServerLive
const ServerLive = HttpApiBuilder.serve().pipe(
  Layer.provide(ApiLive),
  Layer.provide(DbLive),
  Layer.provide(BunHttpServer.layer({ port: 3000 }))
)
```

</details>

<details>
<summary>Hint 4 — what about tests for the new handler?</summary>

End-of-chapter tests will lock down `DbHandlerLive`. The pattern: provide a `Layer.succeed(Db, fakeDb)` instead of `DbLive` in the test, where `fakeDb` is just an object that returns canned rows. We'll do this together once your endpoint works.

</details>

## What you've actually built

- A second endpoint flowing through the same shared `AppApi` value as `health.get`.
- A handler that pulls a database client from Effect's context and runs a typed query.
- A connection pool whose lifecycle is glued to the server's, with no manual `pool.end()` in sight.
- The first piece of state in this app that isn't markdown.

Chapter 2 — Better Auth and the `/me` endpoint — is next. We'll wrap a Promise-based library (`better-auth`) cleanly in Effect, add a session-cookie middleware to HttpApi, write the frontend's `_authed` route gate, and finally have something that actually authenticates a real GitHub user.
