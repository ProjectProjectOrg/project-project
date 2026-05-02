# Exercise 2 — The schema

**File to edit:** `packages/backend/src/db/schema.ts`

## Goal

Declare the `project_index` table as a TypeScript value. This is the file drizzle-kit reads to generate migrations and drizzle-orm reads to type your queries. We're keeping it deliberately small — three columns, no foreign keys yet (we'll add the reference to `users.id` in Chapter 2 once Better Auth has created that table).

## Concepts practiced

- `pgTable(...)` from `drizzle-orm/pg-core` — declarative table definition
- Column helpers: `text`, `timestamp`
- Constraints expressed at the column level: `.primaryKey()`, `.notNull()`, `.defaultNow()`
- Why this file is the source of truth for both runtime and migrations

## Steps

1. Read the comments in `packages/backend/src/db/schema.ts`. They restate the spec's "what lives in Postgres vs markdown" rule — worth re-internalizing before you touch the code.
2. Add the import:
   ```ts
   import { pgTable, text, timestamp } from "drizzle-orm/pg-core"
   ```
3. Declare the table:
   ```ts
   export const projectIndex = pgTable("project_index", {
     slug: text("slug").primaryKey(),
     ownerId: text("owner_id").notNull(),
     createdAt: timestamp("created_at", { withTimezone: true })
       .notNull()
       .defaultNow()
   })
   ```
   Two style points worth registering:
   - **Snake_case in the DB, camelCase in TS.** `pgTable("project_index", { slug, ownerId, createdAt })` maps the SQL identifier on the left of the column helper (`text("owner_id")`) to the TS property name on the right (`ownerId`). Pick one convention per side and don't mix them.
   - **`withTimezone: true` on timestamps.** Postgres has both `timestamp` and `timestamptz`; the latter stores everything in UTC and is what you almost always want. Drizzle defaults to non-tz; opt in.
4. Delete the `export {}` placeholder.
5. Run `bun run --filter @projectproject/backend typecheck`. It should pass — even though no migration has run yet, the file is just TypeScript.

## Acceptance criteria

- [ ] `projectIndex` is exported and the file typechecks.
- [ ] Hovering `projectIndex` in your editor shows a table type with `slug`, `ownerId`, and `createdAt` properties.
- [ ] If you misspell a column name (`text("ownr_id")`), it's still valid TypeScript — drizzle doesn't validate the SQL identifier shape until migration time. Don't worry about that for now; just notice that drizzle's compile-time guarantees stop at the TypeScript boundary, not the SQL boundary.

## Hints

<details>
<summary>Hint 1 — what does <code>.defaultNow()</code> emit in SQL?</summary>

It emits `DEFAULT now()` in the generated migration, which means Postgres fills in the current timestamp at insert time if you don't provide one. The _Drizzle_ type for `createdAt` becomes optional on insert (`db.insert(projectIndex).values({ slug, ownerId })` is valid — `createdAt` is filled by the DB) and required on select (a row that came back from the DB definitely has it).

</details>

<details>
<summary>Hint 2 — should I add an index on <code>ownerId</code>?</summary>

For a real app: yes, eventually — `SELECT * FROM project_index WHERE owner_id = ?` is the canonical "list this user's projects" query and would benefit. For Chapter 1: skip it. We'll add it when we have a query that actually performs poorly without it. Premature indexing is real.

</details>

<details>
<summary>Hint 3 — the full file</summary>

```ts
import { pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const projectIndex = pgTable("project_index", {
  slug: text("slug").primaryKey(),
  ownerId: text("owner_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow()
})
```

</details>
