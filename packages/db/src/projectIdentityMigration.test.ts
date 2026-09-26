import { layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import { describe, expect } from "vitest"

import { MigratedDatabase, migratedDatabase } from "./migrationFixture"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const projectIdentityMigration = "20260924134901_project_identity_per_org"

const web = "00000000-0000-0000-0000-000000000001"

const fixture = `
INSERT INTO "user" (id, name, email) VALUES ('u1', 'U', 'u@example.test');
INSERT INTO "organization" (id, name, slug, created_at) VALUES ('o1', 'IGNE', 'igne', now());
INSERT INTO "member" (id, organization_id, user_id, role, created_at) VALUES ('m1', 'o1', 'u1', 'owner', now());
INSERT INTO "project_index" (id, slug, organization_id, key, name, icon, color, created_by) VALUES
  ('00000000-0000-0000-0000-000000000001', 'web', 'o1', 'WEB', 'Web', 'x', '#000000', 'u1');
INSERT INTO "project_member" (project_id, organization_id, user_id, role_id) VALUES ('00000000-0000-0000-0000-000000000001', 'o1', 'u1', 'pm');
INSERT INTO "project_status" (project_id, slug, label, icon, color, order_key, created_by) VALUES ('00000000-0000-0000-0000-000000000001', 'todo', 'Todo', 'Circle', '#a3a3a3', 'a0', 'u1');
INSERT INTO "ticket_index" (organization_id, org_slug, project_id, project_slug, ticket_id, title, status, type, priority, created_by, created_at, updated_at)
  VALUES ('o1', 'igne', '00000000-0000-0000-0000-000000000001', 'web', 'WEB-1', 'T', 'todo', 'feat', 'med', 'u1', now(), now());
INSERT INTO "comment_index" (id, project_slug, ticket_id, author_id, origin, author_kind) VALUES ('c1', 'web', 'WEB-1', 'u1', 'native', 'user'), ('c2', 'test-project', 'T-1', 'u1', 'native', 'user');
INSERT INTO "attachment_index" (id, organization_id, org_slug, project_slug, ticket_id, object_key, filename, content_type, byte_size, uploaded_by)
  VALUES ('a1', 'o1', 'igne', 'web', 'WEB-1', 'k1', 'f', 'image/png', 1, 'u1'), ('a2', 'o1', 'igne', 'gone', null, 'k2', 'f', 'image/png', 1, 'u1');
INSERT INTO "attachment_reference" (attachment_id, org_slug, project_slug, ticket_id) VALUES ('a1', 'igne', 'web', 'WEB-1'), ('a2', 'igne', 'gone', 'G-1');
INSERT INTO "project_image_reference" (project_slug, org_slug, attachment_id, slot) VALUES ('web', 'igne', 'a1', 'banner');
INSERT INTO "figma_link_index" (id, organization_id, org_slug, project_slug, file_key, node_id, kind) VALUES ('f1', 'o1', 'igne', 'web', 'file', '1:2', 'design');
INSERT INTO "figma_reference" (link_id, org_slug, project_slug, ticket_id) VALUES ('f1', 'igne', 'web', 'WEB-1');
`

describe.skipIf(!databaseUrl)("project identity migration", () => {
  layer(migratedDatabase(databaseUrl, projectIdentityMigration, fixture), {
    timeout: "60 seconds"
  })((it) => {
    it.effect("points every reference at the project id", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        expect(
          yield* database.rows(`
            SELECT 'comment' AS kind, project_id::text FROM "comment_index"
            UNION ALL SELECT 'attachment_reference', project_id::text FROM "attachment_reference"
            UNION ALL SELECT 'image', project_id::text FROM "project_image_reference"
            UNION ALL SELECT 'figma_link', project_id::text FROM "figma_link_index"
            UNION ALL SELECT 'figma_reference', project_id::text FROM "figma_reference"
            UNION ALL SELECT 'ticket', project_id::text FROM "ticket_index"
            ORDER BY 1
          `)
        ).toStrictEqual([
          { kind: "attachment_reference", project_id: web },
          { kind: "comment", project_id: web },
          { kind: "figma_link", project_id: web },
          { kind: "figma_reference", project_id: web },
          { kind: "image", project_id: web },
          { kind: "ticket", project_id: web }
        ])
      })
    )

    it.effect(
      "deletes references to deleted projects but keeps their attachments",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          expect(
            yield* database.rows(
              `SELECT id, project_id::text FROM "attachment_index" ORDER BY id`
            )
          ).toStrictEqual([
            { id: "a1", project_id: web },
            { id: "a2", project_id: null }
          ])
        })
    )

    it.effect("lets two orgs use the same project slug", () =>
      Effect.gen(function* () {
        const database = yield* MigratedDatabase
        yield* database.execute(`
          INSERT INTO "organization" (id, name, slug, created_at) VALUES ('o2', 'Other', 'other', now());
          INSERT INTO "project_index" (slug, organization_id, key, name, icon, color, created_by)
            VALUES ('web', 'o2', 'WEB', 'Web', 'x', '#000000', 'u1');
        `)
        const error = yield* Effect.flip(
          database.execute(`
            INSERT INTO "project_index" (slug, organization_id, key, name, icon, color, created_by)
              VALUES ('web', 'o1', 'WEB2', 'Web', 'x', '#000000', 'u1')
          `)
        )
        expect(error.message).toContain("project_index_organization_slug_uidx")
      })
    )

    it.effect(
      "cascades project deletion to references and keeps attachments org-owned",
      () =>
        Effect.gen(function* () {
          const database = yield* MigratedDatabase
          yield* database.execute(
            `DELETE FROM "project_index" WHERE id = '${web}'`
          )
          expect(
            yield* database.rows(`
              SELECT
                (SELECT count(*) FROM "comment_index")::text AS comments,
                (SELECT count(*) FROM "figma_link_index")::text AS figma_links,
                (SELECT count(*) FROM "ticket_index")::text AS tickets,
                (SELECT count(*) FROM "project_image_reference")::text AS images,
                (SELECT count(*) FROM "attachment_index" WHERE project_id IS NULL)::text AS detached
            `)
          ).toStrictEqual([
            {
              comments: "0",
              figma_links: "0",
              tickets: "0",
              images: "0",
              detached: "2"
            }
          ])
        })
    )
  })
})
