# Exercise 3 — The first migration

**Files involved:** `packages/backend/drizzle.config.ts` (already written), `packages/backend/src/db/migrations/` (will be created by drizzle-kit).

## Goal

Use drizzle-kit to generate a SQL migration from your TypeScript schema, inspect what it wrote, then apply it to the running Postgres. Confirm with `psql` that the table actually exists.

## Concepts practiced

- The split between "schema as code" (`schema.ts`) and "migration as artifact" (a SQL file in `migrations/`) — and why both matter
- `drizzle-kit generate` (diff schema → SQL) vs `drizzle-kit migrate` (apply pending SQL)
- Why migrations are ordered, immutable artifacts you commit to git
- How `drizzle.config.ts` explicitly loads the repo-root `.env` via `dotenv` — Bun's built-in env loading wouldn't reach here from `packages/backend/`

## Steps

1. **Check the docker container is up** — `docker compose ps` should show `(healthy)`. If not, `docker compose up -d` first.
2. **Generate the migration** from inside the backend package:
   ```sh
   bun run --filter @projectproject/backend db:generate
   ```
   This invokes `drizzle-kit generate` with the config file. drizzle-kit will:
   - Read `src/db/schema.ts`.
   - Compare it to the previous migration state (none yet, since this is the first).
   - Write a new SQL file in `src/db/migrations/` with a timestamped name like `0000_<adjective>_<noun>.sql`.
   - Update `src/db/migrations/meta/_journal.json` to track the migration order.
3. **Open the generated SQL file** and read it. You should see something like:
   ```sql
   CREATE TABLE "project_index" (
       "slug" text PRIMARY KEY NOT NULL,
       "owner_id" text NOT NULL,
       "created_at" timestamp with time zone DEFAULT now() NOT NULL
   );
   ```
   Pause on it. This is the artifact production will run. If the schema-as-code is the _intent_, this SQL is the _execution_ — and it lives in git so the diff is reviewable. drizzle-kit isn't doing magic; it's emitting the SQL you would have written by hand.
4. **Apply the migration:**
   ```sh
   bun run --filter @projectproject/backend db:migrate
   ```
   drizzle-kit will connect to `DATABASE_URL`, see no migrations have been applied, and run `0000_*.sql`. It also creates a bookkeeping table (`__drizzle_migrations`) where it tracks what's been applied.
5. **Verify by hand:**
   ```sh
   docker compose exec postgres psql -U projectproject -d projectproject -c "\d project_index"
   ```
   You should see the three columns with the expected types and constraints.

## Acceptance criteria

- [ ] `src/db/migrations/0000_*.sql` exists and is committed-able (it's a real artifact, not a temp file).
- [ ] `psql -c "\d project_index"` shows the table with `slug` (PK), `owner_id`, `created_at` columns.
- [ ] Running `bun run --filter @projectproject/backend db:migrate` a second time is a no-op (drizzle-kit knows it's already applied) — confirms the bookkeeping is real.
- [ ] If you change `schema.ts` and run `db:generate` again, a _new_ numbered migration appears (e.g. `0001_*.sql`) — it does NOT rewrite `0000_*.sql`. Migrations are append-only, by design. (Optional: try this and then delete the new file before committing.)

## Hints

<details>
<summary>Hint 1 — drizzle-kit fails with "url: undefined" or "DATABASE_URL is not defined"</summary>

Two things to check, in order:

1. **`.env` exists at the repo root** (not inside `packages/backend/`) and contains `DATABASE_URL=...`. The `drizzle.config.ts` loads it via `dotenv` with the path `../../.env` (relative to `packages/backend/`).
2. **You're running the script through `bun run --filter @projectproject/backend db:generate`**, not invoking `drizzle-kit` directly. The script's working directory is `packages/backend/`, which is what the relative path in `drizzle.config.ts` is anchored to.

Why we need `dotenv` explicitly: Bun does auto-load `.env`, but only from the directory it's invoked in — it doesn't walk up the tree to find a parent `.env`. The compose / config / generated migration story all need the same env, so we centralize the loading in `drizzle.config.ts`.

If you really need to debug, you can prefix the command with the env var inline (PowerShell):

```powershell
$env:DATABASE_URL="postgres://projectproject:projectproject_dev@localhost:5432/projectproject"; bun run --filter @projectproject/backend db:generate
```

</details>

<details>
<summary>Hint 2 — drizzle-kit asks me to confirm something destructive</summary>

`strict: true` in the config means drizzle-kit prompts before drops, renames, and other lossy operations. For Chapter 1 you should never hit one — you're only adding a table. If it does prompt, read carefully before saying yes; it's saving you from blowing away data.

</details>

<details>
<summary>Hint 3 — what's the difference between <code>db:migrate</code> and <code>db:push</code>?</summary>

`db:migrate` applies the SQL files in `src/db/migrations/` in order, tracking what's been applied in the `__drizzle_migrations` table. This is what production uses — auditable, ordered, idempotent.

`db:push` skips the migration files entirely and pushes the schema directly to the DB by computing the diff at runtime. It's faster for local prototyping but produces no artifact and is not safe for shared databases. Our convention: `db:push` is fine for local exploration, but anything that ships goes through `db:generate` + `db:migrate`.

</details>

<details>
<summary>Hint 4 — can I open Drizzle Studio to poke at the data?</summary>

Yes: `bun run --filter @projectproject/backend db:studio`. It boots a web UI at <https://local.drizzle.studio> (yes, that's a real URL pointing back at localhost — don't worry, the data stays on your machine) where you can view tables, run queries, and edit rows. Useful sanity check after a migration.

</details>
