import { layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const fixture = `
INSERT INTO "user" (id, name, email) VALUES ('import-upgrade', 'User', 'import-upgrade@example.test');
INSERT INTO organization (id, name, slug, created_at) VALUES ('import-upgrade', 'Org', 'import-upgrade', now());
INSERT INTO project_index (id, organization_id, slug, key, name, icon, color, created_by)
VALUES ('00000000-0000-0000-0000-000000000301', 'import-upgrade', 'project', 'IMP', 'Project', 'folder', '#000000', 'import-upgrade');
INSERT INTO comment_index (id, project_id, ticket_id, origin, author_kind, author_id, jira_display_name, jira_account_id)
VALUES ('c_upgrade', '00000000-0000-0000-0000-000000000301', 'IMP-1', 'jira', 'jira', null, 'Ada', 'jira-ada');
`

describe.skipIf(!databaseUrl)("project import upgrade", () => {
  layer(
    migratedDatabase(databaseUrl, "20261117133953_project_import", fixture),
    { timeout: "60 seconds" }
  )((it) => {
    it.effect("keeps existing Jira comment attribution", () =>
      Effect.gen(function* () {
        const db = yield* MigratedDatabase
        expect(
          yield* db.rows(
            "SELECT author_kind, imported_name, imported_source, imported_id FROM comment_index WHERE id = 'c_upgrade'"
          )
        ).toEqual([
          {
            author_kind: "imported",
            imported_name: "Ada",
            imported_source: "jira",
            imported_id: "jira-ada"
          }
        ])
      })
    )
    it.effect("claims existing project keys", () =>
      Effect.gen(function* () {
        const db = yield* MigratedDatabase
        expect(
          yield* db.rows(
            "SELECT key, current::text FROM project_key WHERE organization_id = 'import-upgrade'"
          )
        ).toEqual([{ key: "IMP", current: "true" }])
      })
    )
  })
})
