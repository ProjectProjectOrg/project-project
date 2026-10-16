import { layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Result from "effect/Result"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const fixture = `
INSERT INTO "user" (id, name, email) VALUES
  ('u1', 'One', 'one@example.test'),
  ('u2', 'Two', 'two@example.test'),
  ('u3', 'Three', 'three@example.test');
INSERT INTO "organization" (id, name, slug, created_at) VALUES ('o1', 'Org', 'org', now());
INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES
  ('m1', 'o1', 'u1', 'owner', now()),
  ('m2', 'o1', 'u2', 'member', now()),
  ('m3', 'o1', 'u3', 'member', now());
INSERT INTO "project_index" (slug, organization_id, key, name, icon, color, created_by) VALUES
  ('solo', 'o1', 'SOLO', 'Solo', 'x', '#000000', 'u1'),
  ('pair', 'o1', 'PAIR', 'Pair', 'x', '#000000', 'u1'),
  ('race', 'o1', 'RACE', 'Race', 'x', '#000000', 'u2'),
  ('gone', 'o1', 'GONE', 'Gone', 'x', '#000000', 'u3');
INSERT INTO "project_member" (project_id, organization_id, user_id, role_id)
  SELECT p.id, 'o1', m.user_id, m.role_id
  FROM (VALUES
    ('solo', 'u1', 'pm'), ('solo', 'u2', 'developer'),
    ('pair', 'u1', 'pm'), ('pair', 'u2', 'pm'),
    ('race', 'u2', 'pm'), ('race', 'u3', 'pm'),
    ('gone', 'u3', 'pm')
  ) AS m(slug, user_id, role_id)
  JOIN "project_index" p ON p.slug = m.slug;
`

const pms = (slug: string) => `
  SELECT pm.user_id FROM "project_member" pm
  JOIN "project_index" p ON p.id = pm.project_id
  WHERE p.slug = '${slug}' AND pm.role_id = 'pm'
  ORDER BY 1
`

const memberOf = (slug: string, userId: string) => `
  "project_id" = (SELECT id FROM "project_index" WHERE slug = '${slug}')
  AND "user_id" = '${userId}'
`

describe.skipIf(!databaseUrl)("a project keeps a pm", () => {
  layer(
    migratedDatabase(databaseUrl, "20260925095634_project_keeps_a_pm", fixture),
    { timeout: "60 seconds" }
  )((it) => {
    it.effect("refuses to demote or remove the last pm", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        const demoting = yield* Effect.flip(
          database.execute(
            `UPDATE "project_member" SET "role_id" = 'developer' WHERE ${memberOf("solo", "u1")}`
          )
        )
        const removing = yield* Effect.flip(
          database.execute(
            `DELETE FROM "project_member" WHERE ${memberOf("solo", "u1")}`
          )
        )
        expect(demoting.message).toContain("without a pm")
        expect(removing.message).toContain("without a pm")
        expect(yield* database.rows(pms("solo"))).toStrictEqual([
          { user_id: "u1" }
        ])
      })
    )

    it.effect("refuses to remove the last pm from the org", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        const leaving = yield* Effect.flip(
          database.execute(`DELETE FROM "member" WHERE "user_id" = 'u1'`)
        )
        expect(leaving.message).toContain("without a pm")
        expect(
          yield* database.rows(`SELECT id FROM "member" WHERE user_id = 'u1'`)
        ).toStrictEqual([{ id: "m1" }])
      })
    )

    it.effect("lets a pm step down while another remains", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        yield* database.execute(
          `UPDATE "project_member" SET "role_id" = 'developer' WHERE ${memberOf("pair", "u2")}`
        )
        expect(yield* database.rows(pms("pair"))).toStrictEqual([
          { user_id: "u1" }
        ])
      })
    )

    it.effect("lets a project be deleted together with its pms", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        yield* database.execute(
          `DELETE FROM "project_index" WHERE "slug" = 'gone'`
        )
        expect(yield* database.rows(pms("gone"))).toStrictEqual([])
      })
    )

    it.effect(
      "lets only one of two concurrent changes remove a project's pms",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          const removeTwo = database.execute(`
            BEGIN;
            DELETE FROM "project_member" WHERE ${memberOf("race", "u2")};
            SELECT pg_sleep(0.3);
            COMMIT;
          `)
          const demoteThree = database.execute(`
            BEGIN;
            UPDATE "project_member" SET "role_id" = 'developer' WHERE ${memberOf("race", "u3")};
            SELECT pg_sleep(0.3);
            COMMIT;
          `)
          const outcomes = yield* Effect.all(
            [Effect.result(removeTwo), Effect.result(demoteThree)],
            { concurrency: "unbounded" }
          )
          expect(outcomes.filter(Result.isFailure)).toHaveLength(1)
          expect(yield* database.rows(pms("race"))).toHaveLength(1)
        })
    )
  })
})
