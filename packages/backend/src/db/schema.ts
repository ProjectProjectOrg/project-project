// packages/backend/src/db/schema.ts
//
// THE DATABASE SCHEMA, AS TYPESCRIPT.
// ============================================================================
// drizzle-orm lets you describe Postgres tables as TypeScript values. The
// shape you write here drives three things:
//
//   1. The *generated SQL migrations* (`drizzle-kit generate` reads this file
//      and emits SQL into `src/db/migrations/`).
//   2. The *runtime types* of `db.select().from(projectIndex)` — Drizzle
//      infers what columns each row has, so a row from `projectIndex` is
//      `{ slug: string, ownerId: string, createdAt: Date }` in TypeScript.
//   3. The *insert/update/select APIs* — `db.insert(projectIndex).values({...})`
//      type-checks against this definition.
//
// IMPORTANT — what we put here, and what we don't.
// ----------------------------------------------------------------------------
// `docs/PROJECTPROJECT.md` is opinionated about this:
//
//   > Postgres holds only what *has* to be in a database: identity, sessions,
//   > and a thin index for fast project lookup. Everything else is markdown.
//
// So we declare *only* the `project_index` table here. There will be no
// `tickets` table, no `members` table, no `comments` table. Those live in
// markdown frontmatter.
//
// In Chapter 2 we'll let Better Auth's drizzle adapter add its own tables
// (users, sessions, accounts, verification_tokens) — those will appear in
// this same schema file via `import` of Better Auth's helpers, alongside the
// hand-written `projectIndex`.
//
// CHAPTER 1 GOAL
// ----------------------------------------------------------------------------
// Define `projectIndex` with three columns:
//
//   slug         text, primary key
//   ownerId      text, not null  — references users.id once Chapter 2 adds it
//   createdAt    timestamp, not null, defaults to now()
//
// Then run `bun run db:generate` to produce the first migration, and
// `bun run db:migrate` to apply it against the running Postgres.

import { index, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core"

export * from "./auth-schema"
import { user } from "./auth-schema"

export const projectIndex = pgTable("project_index", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
})

// Project ↔ user membership. The DB is authoritative for permission checks;
// the markdown frontmatter mirrors usernames as a human/AI-readable label.
//
// Composite PK on (projectSlug, userId) means a user is in a project at most
// once. The frontmatter array of usernames is rewritten after every change
// here so the file stays in sync.
export const projectMember = pgTable(
  "project_member",
  {
    projectSlug: text("project_slug")
      .notNull()
      .references(() => projectIndex.slug, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["owner", "admin", "member"] }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow()
  },
  (table) => [
    primaryKey({ columns: [table.projectSlug, table.userId] }),
    index("project_member_user_idx").on(table.userId)
  ]
)
