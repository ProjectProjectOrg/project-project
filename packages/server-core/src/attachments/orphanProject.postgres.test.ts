import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { Access } from "../access/Access"
import { OrgStorage } from "../storage/OrgStorage"
import { S3Storage } from "../storage/S3Storage"
import { Attachments } from "./Attachments"
import { AttachmentsLive } from "./AttachmentsLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

class RemovalFailed extends Schema.TaggedError<RemovalFailed>()(
  "RemovalFailed",
  {}
) {}

describe.skipIf(!databaseUrl)("orphanProject", () => {
  const organizationId = randomUUID()
  const orgSlug = `orphan-${organizationId.slice(0, 8)}`
  const doomed = randomUUID()
  const survivor = randomUUID()
  let pool: Pool
  let layer: Layer.Layer<Attachments>

  const statuses = () =>
    Effect.promise(async () =>
      Object.fromEntries(
        (
          await pool.query<{ id: string; status: string }>(
            "SELECT id, status FROM attachment_index WHERE organization_id = $1",
            [organizationId]
          )
        ).rows.map((row) => [row.id, row.status])
      )
    )

  const deleteProject = (projectId: string) =>
    Effect.promise(() =>
      pool.query("DELETE FROM project_index WHERE id = $1", [projectId])
    ).pipe(Effect.asVoid)

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Test requires an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), { migrationsFolder })
    await pool.query(
      "INSERT INTO organization (id, name, slug, created_at) VALUES ($1, $1, $2, now())",
      [organizationId, orgSlug]
    )
    for (const [id, slug, key] of [
      [doomed, "doomed", "DOOM"],
      [survivor, "survivor", "SURV"]
    ]) {
      await pool.query(
        "INSERT INTO project_index (id, slug, organization_id, key, name, icon, color, created_by) VALUES ($1, $2, $3, $4, $2, 'x', '#000000', 'user-1')",
        [id, slug, organizationId, key]
      )
    }
    for (const [id, projectId] of [
      ["a1", doomed],
      ["a2", doomed],
      ["a3", survivor],
      ["a4", survivor],
      ["a5", doomed]
    ]) {
      await pool.query(
        "INSERT INTO attachment_index (id, organization_id, org_slug, project_id, object_key, filename, content_type, byte_size, status, uploaded_by) VALUES ($1, $2, $3, $4, $1, $1, 'image/png', 1, 'live', 'user-1')",
        [`${organizationId}-${id}`, organizationId, orgSlug, projectId]
      )
    }
    await pool.query(
      "INSERT INTO project_image_reference (project_id, attachment_id, slot) VALUES ($1, $2, 'banner')",
      [doomed, `${organizationId}-a2`]
    )
    await pool.query(
      "INSERT INTO attachment_reference (attachment_id, project_id, ticket_id) VALUES ($1, $2, 'DOOM-1'), ($3, $2, 'DOOM-1'), ($3, $4, 'SURV-1')",
      [`${organizationId}-a3`, doomed, `${organizationId}-a4`, survivor]
    )

    const db = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
      )
    )
    layer = AttachmentsLive.pipe(
      Layer.provide(db),
      Layer.provide(Layer.succeed(Access, {} as never)),
      Layer.provide(Layer.succeed(OrgStorage, {} as never)),
      Layer.provide(Layer.succeed(S3Storage, {} as never)),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id = $1", [
        organizationId
      ])
      await pool.end()
    }
  })

  it.effect("leaves everything live when the removal fails", () =>
    Effect.gen(function* () {
      const attachments = yield* Attachments
      const error = yield* Effect.flip(
        attachments.orphanProject(orgSlug, "doomed", new RemovalFailed())
      )
      expect(error._tag).toBe("RemovalFailed")
      expect(Object.values(yield* statuses())).toStrictEqual([
        "live",
        "live",
        "live",
        "live",
        "live"
      ])
    }).pipe(Effect.provide(layer))
  )

  it.effect(
    "orphans what the deleted project uploaded or used, and keeps what others still use",
    () =>
      Effect.gen(function* () {
        const attachments = yield* Attachments
        const result = yield* attachments.orphanProject(
          orgSlug,
          "doomed",
          deleteProject(doomed)
        )
        const byId = yield* statuses()
        expect(result.orphaned).toBe(4)
        expect([
          byId[`${organizationId}-a1`],
          byId[`${organizationId}-a2`],
          byId[`${organizationId}-a3`],
          byId[`${organizationId}-a4`],
          byId[`${organizationId}-a5`]
        ]).toStrictEqual([
          "orphaned",
          "orphaned",
          "orphaned",
          "live",
          "orphaned"
        ])
      }).pipe(Effect.provide(layer))
  )
})
