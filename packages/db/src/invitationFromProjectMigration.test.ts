import { layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const invitationFromProjectMigration = "20261002091814_invitation_from_project"

const project = "00000000-0000-0000-0000-000000000001"

const fixture = `
INSERT INTO "user" (id, name, email) VALUES
  ('admin', 'Admin', 'admin@example.test'),
  ('pm', 'Pm', 'pm@example.test');
INSERT INTO "organization" (id, name, slug, created_at) VALUES ('o1', 'IGNE', 'igne', now());
INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES
  ('m1', 'o1', 'admin', 'admin', now()),
  ('m2', 'o1', 'pm', 'member', now());
INSERT INTO "project_index" (id, slug, organization_id, key, name, icon, color, created_by) VALUES
  ('${project}', 'web', 'o1', 'WEB', 'Web', 'x', '#000000', 'pm');
INSERT INTO "invitation" (id, organization_id, email, role, status, expires_at, created_at, inviter_id) VALUES
  ('admin-role', 'o1', 'a@example.test', 'admin', 'pending', now() + interval '7 days', now() AT TIME ZONE 'UTC', 'admin'),
  ('org-invite-later-grant', 'o1', 'b@example.test', 'member', 'pending', now() + interval '7 days', (now() - interval '1 day') AT TIME ZONE 'UTC', 'admin'),
  ('project-invite-by-admin', 'o1', 'c@example.test', 'member', 'pending', now() + interval '7 days', now() AT TIME ZONE 'UTC', 'admin'),
  ('project-invite-by-pm', 'o1', 'd@example.test', 'guest', 'pending', now() + interval '7 days', now() AT TIME ZONE 'UTC', 'pm'),
  ('expired', 'o1', 'e@example.test', 'member', 'pending', now() - interval '1 day', now() AT TIME ZONE 'UTC', 'pm'),
  ('no-grant', 'o1', 'f@example.test', 'member', 'pending', now() + interval '7 days', now() AT TIME ZONE 'UTC', 'pm');
INSERT INTO "project_invite_grant" (invitation_id, project_id, role_id, created_at) VALUES
  ('admin-role', '${project}', 'developer', now()),
  ('org-invite-later-grant', '${project}', 'developer', now()),
  ('project-invite-by-admin', '${project}', 'developer', now()),
  ('project-invite-by-pm', '${project}', 'client', now()),
  ('expired', '${project}', 'developer', now());
`

describe.skipIf(!databaseUrl)("invitation from_project migration", () => {
  layer(
    migratedDatabase(databaseUrl, invitationFromProjectMigration, fixture),
    { timeout: "60 seconds" }
  )((it) => {
    it.effect("marks only invitations a project created", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        expect(
          yield* database.rows(
            `SELECT id, from_project::text FROM "invitation" ORDER BY id`
          )
        ).toStrictEqual([
          { id: "admin-role", from_project: "false" },
          { id: "expired", from_project: "false" },
          { id: "no-grant", from_project: "false" },
          { id: "org-invite-later-grant", from_project: "false" },
          { id: "project-invite-by-admin", from_project: "true" },
          { id: "project-invite-by-pm", from_project: "true" }
        ])
      })
    )
  })
})
