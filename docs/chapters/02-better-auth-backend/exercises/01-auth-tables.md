# Exercise 1 — Auth tables and the second migration

**Files to edit:** `packages/backend/src/db/schema.ts`, `packages/backend/src/auth.ts` (new, but only the minimum the CLI needs to read), `.env.example` (additions).

## Goal

Generate the Better Auth tables as a Drizzle schema file, re-export them from your existing `schema.ts`, and produce + apply a second migration that adds `user`, `session`, `account`, `verification` to your local Postgres.

## Concepts practiced

- Reading a tool's "config-as-input" model (the CLI introspects your Better Auth config to decide what tables you need).
- Composing multiple schema sources into a single Drizzle "schema bag" so drizzle-kit and the runtime client both see all of them.
- Idempotent migration generation — drizzle-kit diffs against the previous migration, so running `db:generate` twice doesn't add duplicate SQL.

## Steps

1. Install Better Auth in the backend workspace. Bun's `add` doesn't take `--filter` (that's a `bun run` thing), so use one of:
   ```
   cd packages/backend && bun add better-auth
   ```
   or, from the repo root:
   ```
   bun add better-auth --cwd packages/backend
   ```
   (Better Auth has zero peer dependencies you need to think about for this chapter. Drizzle is already there.)

2. Add new env vars to `.env.example`:
   ```
   GITHUB_CLIENT_ID=
   GITHUB_CLIENT_SECRET=
   BETTER_AUTH_SECRET=
   BETTER_AUTH_URL=http://localhost:3000
   ```
   Then copy them into your real `.env`. For `BETTER_AUTH_SECRET`, run `openssl rand -base64 32` (or anything similarly random — Better Auth uses it to sign cookies). The GitHub client id/secret come from creating a GitHub OAuth App next step.

3. Create a GitHub OAuth App at <https://github.com/settings/developers>:
   - **Application name:** anything (e.g. "ProjectProject (dev)").
   - **Homepage URL:** `http://localhost:3000`
   - **Authorization callback URL:** `http://localhost:3000/api/auth/callback/github`
   - Click "Register application", then "Generate a new client secret". Paste the client id and secret into `.env`.

4. Create the **bare-minimum** `packages/backend/src/auth.ts` — just enough that the Better Auth CLI can read it. The full configuration belongs in Exercise 2; for now you only need the shape that determines _which tables_ get generated. The stub file is already there with TODO comments — fill in only the parts the CLI needs:
   - `database` adapter pointing at your Drizzle client.
   - `socialProviders.github` (with empty client id/secret strings is fine for the CLI run).
   - `secret` can be a placeholder string for now.

   You don't need to import this file from anywhere yet. The CLI runs it standalone.

5. Generate the Better Auth Drizzle schema. From the repo root:
   ```
   bunx @better-auth/cli generate \
     --config ./packages/backend/src/auth.ts \
     --output ./packages/backend/src/db/auth-schema.ts
   ```
   - On Windows, replace the line continuations with one line, or run from PowerShell with backticks.
   - The CLI may ask whether to overwrite — answer yes.
   - The output file should declare four `pgTable`s: `user`, `session`, `account`, `verification`. Skim it to see what columns each one has; it'll save you confusion later.

6. Wire the generated tables into your existing `schema.ts`. The cleanest pattern is a re-export bag:
   ```ts
   // packages/backend/src/db/schema.ts
   export { projectIndex } from "./schema-app"  // or just leave it inline here
   export * from "./auth-schema"
   ```
   How you split is your call. The constraint: drizzle-kit's config (we'll set this in step 7) points at one file or one glob, and that source must export every table.

7. Open `packages/backend/drizzle.config.ts` and confirm the `schema` field still points at the file (or files) that re-export everything. If you split into two files, change it to a glob like `./src/db/*.ts`.

8. Generate the new migration:
   ```
   bun run --filter @projectproject/backend db:generate
   ```
   You should see a fresh `NNNN_*.sql` file in `src/db/migrations/` containing only `CREATE TABLE` statements for `user`, `session`, `account`, `verification` (and any related indexes / FK constraints). The first migration's `project_index` should _not_ appear here — drizzle-kit diffs against the previous migration's snapshot.

9. Apply it:
   ```
   bun run --filter @projectproject/backend db:migrate
   ```

10. Verify in `psql` (or Drizzle Studio):
    ```
    \dt
    ```
    You should see five tables: `project_index`, `user`, `session`, `account`, `verification`.

## Acceptance criteria

- [ ] `bun add better-auth` completed; `package.json` lists it as a dependency.
- [ ] `.env.example` has the four new variables, and your local `.env` has real values for at least `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `BETTER_AUTH_SECRET`.
- [ ] `packages/backend/src/db/auth-schema.ts` exists and is generated (no manual edits).
- [ ] `packages/backend/src/db/schema.ts` re-exports both `projectIndex` and the auth tables.
- [ ] A new migration file appears in `src/db/migrations/` and creates the four auth tables.
- [ ] `\dt` in psql shows all five tables.
- [ ] `bun run --filter @projectproject/backend typecheck` passes.

## Hints

<details>
<summary>Hint 1 — what the bare-minimum <code>auth.ts</code> looks like</summary>

The CLI only needs to construct the Better Auth instance to know which tables you want. It doesn't make HTTP calls, doesn't talk to GitHub, doesn't actually open your DB. So a `db` for the adapter that's _structurally_ a Drizzle client is enough; placeholders are fine.

```ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { drizzle } from "drizzle-orm/node-postgres"

const db = drizzle(process.env.DATABASE_URL ?? "postgres://placeholder")

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  secret: process.env.BETTER_AUTH_SECRET ?? "placeholder-only-for-cli",
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
      scope: ["read:user", "user:email", "repo"]
    }
  }
})
```

This is exactly the shape Exercise 2 will polish. For now it's just enough to satisfy the CLI.

</details>

<details>
<summary>Hint 2 — drizzle.config.ts and multiple schema files</summary>

If you split `projectIndex` and the auth tables across two files, drizzle-kit's `schema` field accepts either a single path or a glob:

```ts
// packages/backend/drizzle.config.ts
export default defineConfig({
  schema: "./src/db/*.ts",   // glob — picks up both files
  // ...
})
```

Or keep one `schema.ts` that re-exports everything and leave the config pointed at that single file.

</details>

<details>
<summary>Hint 3 — what if I already see a "drift" warning when generating?</summary>

If `db:generate` warns that the schema drifted from the database (because you applied migration 0001 already and the snapshot differs), it's usually because you edited `schema.ts` between the previous `db:generate` and now. Resolve by:

1. Running `db:generate` to produce a fresh migration that captures the diff.
2. Inspecting the SQL — make sure it's only adding the new tables, not dropping `project_index`.
3. If the SQL looks wrong, delete the new migration file and retry after fixing your schema.

Don't manually edit the snapshot files in `migrations/meta/`. They're drizzle-kit's bookkeeping.

</details>
