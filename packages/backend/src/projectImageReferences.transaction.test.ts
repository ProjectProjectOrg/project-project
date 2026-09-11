import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { randomUUID } from "node:crypto"
import { Pool } from "pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import { and, eq } from "drizzle-orm"
import { PgClient } from "@effect/sql-pg"
import { DateTime, Effect, Layer, ManagedRuntime, Redacted } from "effect"
import { DbLive } from "./Layers/Db"
import { Db } from "./Services/Db"
import { relations } from "./db/schema"
import {
  attachmentIndex,
  organization,
  projectImageReference
} from "./db/schema"
import { projectIndex } from "./db/schema"
import { replaceProjectImageReference } from "./projectImageReferences"
import type { SqlError } from "effect/unstable/sql/SqlError"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)(
  "replaceProjectImageReference transactional pairing",
  () => {
    const orgId = randomUUID()
    const orgSlug = `org-${orgId.slice(0, 8)}`
    const projectSlug = `project-${orgId.slice(0, 8)}`
    const oldAttachmentId = randomUUID()
    const newAttachmentId = randomUUID()

    let pool: Pool
    let runtime: ManagedRuntime.ManagedRuntime<Db, SqlError>

    beforeAll(async () => {
      if (!databaseUrl) throw new Error("Test database URL is required")
      const url = new URL(databaseUrl)
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) ||
        !url.pathname.startsWith("/projectproject_effect_v4_")
      ) {
        throw new Error(
          "Database compatibility tests require an isolated local test database"
        )
      }
      pool = new Pool({ connectionString: databaseUrl })
      await migrate(drizzle({ client: pool }), {
        migrationsFolder: `${import.meta.dirname}/db/migrations`
      })
      runtime = ManagedRuntime.make(
        DbLive.pipe(
          Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
        )
      )

      const promiseDb = drizzle({ client: pool, relations })
      await promiseDb.insert(organization).values({
        id: orgId,
        name: "Test org",
        slug: orgSlug,
        createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-09-10T00:00:00Z"))
      })
      await promiseDb.insert(projectIndex).values({
        slug: projectSlug,
        organizationId: orgId,
        key: "TST",
        name: "Test project",
        icon: "🧪",
        color: "gray",
        createdBy: "user-1"
      })
      await promiseDb.insert(attachmentIndex).values([
        {
          id: oldAttachmentId,
          organizationId: orgId,
          orgSlug,
          projectSlug,
          objectKey: "old.png",
          filename: "old.png",
          contentType: "image/png",
          byteSize: 10,
          status: "live",
          uploadedBy: "user-1"
        },
        {
          id: newAttachmentId,
          organizationId: orgId,
          orgSlug,
          projectSlug,
          objectKey: "new.png",
          filename: "new.png",
          contentType: "image/png",
          byteSize: 10,
          status: "live",
          uploadedBy: "user-1"
        }
      ])
      await promiseDb.insert(projectImageReference).values({
        projectSlug,
        orgSlug,
        attachmentId: oldAttachmentId,
        slot: "icon"
      })
    })

    afterAll(async () => {
      if (pool) {
        await pool.query('DELETE FROM "organization" WHERE id = $1', [orgId])
        await pool.end()
      }
      await runtime?.dispose()
    })

    it("rolls back the first slot write when the second slot write fails", async () => {
      const exit = await runtime.runPromiseExit(
        Effect.gen(function* () {
          const db = yield* Db
          return yield* db.transaction(() =>
            Effect.gen(function* () {
              yield* replaceProjectImageReference(db, {
                orgSlug,
                projectSlug,
                slot: "icon",
                attachmentId: newAttachmentId
              })
              yield* replaceProjectImageReference(db, {
                orgSlug,
                projectSlug,
                slot: "icon_source",
                attachmentId: randomUUID()
              })
            })
          )
        })
      )
      expect(exit._tag).toBe("Failure")

      const readDb = drizzle({ client: pool, relations })
      const iconRows = await readDb
        .select()
        .from(projectImageReference)
        .where(
          and(
            eq(projectImageReference.projectSlug, projectSlug),
            eq(projectImageReference.slot, "icon")
          )
        )
      expect(iconRows[0]?.attachmentId).toBe(oldAttachmentId)

      const oldAttachment = await readDb
        .select()
        .from(attachmentIndex)
        .where(eq(attachmentIndex.id, oldAttachmentId))
      expect(oldAttachment[0]?.status).toBe("live")
      expect(oldAttachment[0]?.orphanedAt).toBeNull()

      const newAttachment = await readDb
        .select()
        .from(attachmentIndex)
        .where(eq(attachmentIndex.id, newAttachmentId))
      expect(newAttachment[0]?.status).toBe("live")

      const iconSourceRows = await readDb
        .select()
        .from(projectImageReference)
        .where(
          and(
            eq(projectImageReference.projectSlug, projectSlug),
            eq(projectImageReference.slot, "icon_source")
          )
        )
      expect(iconSourceRows).toHaveLength(0)
    })
  }
)
