// drizzle-kit configuration.
//
// drizzle-kit is the *tooling* sibling of drizzle-orm: it reads your schema
// files and generates SQL migrations from them. drizzle-orm itself, the thing
// you'll `yield* PgDrizzle` to use at runtime, never sees this config — it
// only matters for `bun run drizzle-kit generate` and `bun run drizzle-kit migrate`.
//
// The flow:
//   1. You edit `src/db/schema.ts` (TypeScript with `pgTable(...)`).
//   2. `drizzle-kit generate` diffs the schema against the last migration and
//      writes a new SQL file in `src/db/migrations/`.
//   3. `drizzle-kit migrate` applies pending migrations to the DB at
//      `dbCredentials.url`.
//
// Why have a separate tool for this? Because schema-as-code is ergonomic to
// write but databases need durable, ordered, reviewable SQL. drizzle-kit is
// the bridge.

import { config } from "dotenv"
import { defineConfig } from "drizzle-kit"

// Explicitly load the repo-root `.env`. Why not rely on Bun's built-in env
// loading? Two reasons:
//   1. drizzle-kit's binary is a Node CLI; depending on how it spawns, our
//      Bun-loaded env may not propagate.
//   2. Even with Bun, `.env` is loaded from the *current working directory*,
//      not walked up the tree. `bun run --filter @projectproject/backend ...`
//      effectively runs in `packages/backend/`, where no `.env` lives.
//
// `dotenv` is the simplest reliable bridge — explicit path, fails loudly if
// the file is missing, no behavioral surprises.
config({ path: "../../.env" })

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env["DATABASE_URL"]!
  },
  // Strict mode: prompt before destructive operations (drops, renames, etc.).
  // Useful when migrations are first-class artifacts you'll review by hand.
  strict: true,
  verbose: true
})
