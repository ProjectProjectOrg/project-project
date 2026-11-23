import { layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const statusPhaseMigration = "20261123142713_status_phase"

const web = "00000000-0000-0000-0000-000000000001"
const api = "00000000-0000-0000-0000-000000000002"

const fixture = `
INSERT INTO "user" (id, name, email) VALUES ('u1', 'U', 'u@example.test');
INSERT INTO "organization" (id, name, slug, created_at) VALUES ('o1', 'IGNE', 'igne', now());
INSERT INTO "project_index" (id, slug, organization_id, key, name, icon, color, created_by) VALUES
  ('${web}', 'web', 'o1', 'WEB', 'Web', 'x', '#000000', 'u1'),
  ('${api}', 'api', 'o1', 'API', 'Api', 'x', '#000000', 'u1');
INSERT INTO "project_status" (project_id, slug, label, icon, color, order_key, created_by) VALUES
  ('${web}', 'refine', 'Refine', 'Circle', '#a3a3a3', 'Zz', 'u1'),
  ('${web}', 'todo', 'Todo', 'Circle', '#a3a3a3', 'a0', 'u1'),
  ('${web}', 'in_progress', 'In progress', 'CircleDot', '#3b82f6', 'a1', 'u1'),
  ('${web}', 'review', 'Review', 'Eye', '#e0a03b', 'a1V', 'u1'),
  ('${web}', 'done', 'Done', 'CircleCheck', '#22c55e', 'a2', 'u1'),
  ('${web}', 'wont_do', 'Won''t do', 'Ban', '#a3a3a3', 'a3', 'u1'),
  ('${api}', 'todo', 'Todo', 'Circle', '#a3a3a3', 'a0', 'u1'),
  ('${api}', 'in_progress', 'In progress', 'CircleDot', '#3b82f6', 'a1', 'u1'),
  ('${api}', 'shipped', 'Shipped', 'Rocket', '#22c55e', 'a2', 'u1');
`

describe.skipIf(!databaseUrl)("status phase migration", () => {
  layer(migratedDatabase(databaseUrl, statusPhaseMigration, fixture), {
    timeout: "60 seconds"
  })((it) => {
    it.effect(
      "gives each status the phase its position implied, built-ins by slug",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          expect(
            yield* database.rows(
              `SELECT p.slug AS project, s.slug, s.phase FROM "project_status" s JOIN "project_index" p ON p.id = s.project_id ORDER BY p.slug, s.order_key collate "C"`
            )
          ).toStrictEqual([
            { project: "api", slug: "todo", phase: "unstarted" },
            { project: "api", slug: "in_progress", phase: "started" },
            { project: "api", slug: "shipped", phase: "started" },
            { project: "web", slug: "refine", phase: "unstarted" },
            { project: "web", slug: "todo", phase: "unstarted" },
            { project: "web", slug: "in_progress", phase: "started" },
            { project: "web", slug: "review", phase: "started" },
            { project: "web", slug: "done", phase: "finished" },
            { project: "web", slug: "wont_do", phase: "finished" }
          ])
        })
    )
  })
})
