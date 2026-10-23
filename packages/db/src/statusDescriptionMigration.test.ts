import { layer } from "@effect/vitest"
import { baselineStatusDescription } from "@pp/shared"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const statusDescriptionMigration = "20261023133303_status_description"

const fixture = `
INSERT INTO "user" (id, name, email) VALUES ('u1', 'U', 'u@example.test');
INSERT INTO "organization" (id, name, slug, created_at) VALUES ('o1', 'IGNE', 'igne', now());
INSERT INTO "project_index" (id, slug, organization_id, key, name, icon, color, created_by) VALUES
  ('00000000-0000-0000-0000-000000000001', 'web', 'o1', 'WEB', 'Web', 'x', '#000000', 'u1');
INSERT INTO "project_status" (project_id, slug, label, icon, color, order_key, created_by) VALUES
  ('00000000-0000-0000-0000-000000000001', 'todo', 'Todo', 'Circle', '#a3a3a3', 'a0', 'u1'),
  ('00000000-0000-0000-0000-000000000001', 'in_progress', 'In progress', 'CircleDot', '#3b82f6', 'a1', 'u1'),
  ('00000000-0000-0000-0000-000000000001', 'in_review', 'In review', 'Eye', '#e0a03b', 'a1V', 'u1'),
  ('00000000-0000-0000-0000-000000000001', 'done', 'Done', 'CircleCheck', '#22c55e', 'a2', 'u1');
`

describe.skipIf(!databaseUrl)("status description migration", () => {
  layer(migratedDatabase(databaseUrl, statusDescriptionMigration, fixture), {
    timeout: "60 seconds"
  })((it) => {
    it.effect(
      "gives existing built-in statuses the seeded description and leaves custom ones empty",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          expect(
            yield* database.rows(
              `SELECT slug, description FROM "project_status" ORDER BY order_key`
            )
          ).toStrictEqual([
            { slug: "todo", description: baselineStatusDescription("todo") },
            {
              slug: "in_progress",
              description: baselineStatusDescription("in_progress")
            },
            { slug: "in_review", description: null },
            { slug: "done", description: baselineStatusDescription("done") }
          ])
        })
    )
  })
})
