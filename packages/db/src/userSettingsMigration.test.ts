import { layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const userSettingsMigration = "20261114183146_user_settings"

const fixture = `
INSERT INTO "user" (id, name, email, editor_preference) VALUES
  ('u1', 'A', 'a@example.test', 'cursor'),
  ('u2', 'B', 'b@example.test', null),
  ('u3', 'C', 'c@example.test', 'emacs');
`

describe.skipIf(!databaseUrl)("user settings migration", () => {
  layer(migratedDatabase(databaseUrl, userSettingsMigration, fixture), {
    timeout: "60 seconds"
  })((it) => {
    it.effect("moves valid editor preferences into user_settings", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        expect(
          yield* database.rows(
            `SELECT user_id, editor_preference, avatar_source FROM "user_settings" ORDER BY user_id`
          )
        ).toStrictEqual([
          { user_id: "u1", editor_preference: "cursor", avatar_source: null }
        ])
        expect(
          yield* database.rows(
            `SELECT column_name FROM information_schema.columns WHERE table_name = 'user' AND column_name = 'editor_preference'`
          )
        ).toStrictEqual([])
      })
    )
  })
})
