// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { readFile } from "node:fs/promises"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive } from "@pp/db"
import { Access } from "@pp/server-core/access/Access"
import { AccessLive } from "@pp/server-core/access/AccessLive"
import { orgScope, testUser } from "@pp/server-core/access/testing"
import { Attachments } from "@pp/server-core/attachments/Attachments"
import { AttachmentsLive } from "@pp/server-core/attachments/AttachmentsLive"
import { Figma } from "@pp/server-core/figma/Figma"
import { FigmaIntegrations } from "@pp/server-core/figma/FigmaIntegrations"
import { FigmaLinks } from "@pp/server-core/figma/FigmaLinks"
import { FigmaLinksLive } from "@pp/server-core/figma/FigmaLinksLive"
import { GitHub } from "@pp/server-core/github/GitHub"
import { BannerPlaceholders } from "@pp/server-core/projects/BannerPlaceholders"
import { FinishedStatuses } from "@pp/server-core/projects/FinishedStatuses"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectsLive } from "@pp/server-core/projects/ProjectsLive"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { S3Storage } from "@pp/server-core/storage/S3Storage"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import { TicketIndexLive } from "@pp/server-core/tickets/TicketIndexLive"
import * as TicketQueries from "@pp/server-core/tickets/TicketQueries"
import { Tickets } from "@pp/server-core/tickets/Tickets"
import { Users } from "@pp/server-core/users/Users"
import {
  ActivityActor,
  AppApi,
  Authentication,
  CurrentUser,
  OrgScope
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { HttpRouter, HttpServer } from "effect/http"
import { HttpApi, HttpApiBuilder } from "effect/http-api"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { TicketsHandlerLive } from "./handlers/tickets"
import { OrgAccessLive, ProjectAccessLive } from "./Layers/Access"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("published project visibility", () => {
  const userId = randomUUID()
  const organizationId = randomUUID()
  const publishedId = randomUUID()
  const hiddenId = randomUUID()
  let pool: Pool
  let projectsLayer: Layer.Layer<Projects | Access>
  let ticketIndexLayer: Layer.Layer<TicketIndex>
  let reconciledSlugs: ReadonlyArray<string> = []

  const dbLayer = () =>
    DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl!), maxConnections: 1 })
      )
    )

  const ownerScope = orgScope("owner", {
    userId,
    organizationId,
    orgSlug: `visibility-${organizationId}`
  })

  const apiRouter = Layer.effect(
    HttpRouter.HttpRouter,
    Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed("/api"))
  )

  const access = () => AccessLive.pipe(Layer.provide(dbLayer()))

  const asOwner = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    Effect.provideService(effect, CurrentUser, testUser(userId))

  const storage = Layer.mock(OrgStorage, {
    requireConnection: () =>
      Effect.succeed({
        endpoint: "https://storage.example.test",
        bucket: "visibility",
        region: "auto",
        keyPrefix: null,
        forcePathStyle: true,
        accessKeyId: "key",
        secretAccessKey: "secret"
      })
  })

  const insertAttachment = (
    id: string,
    projectId: string | null,
    status = "live"
  ) =>
    pool.query(
      "insert into attachment_index (id, organization_id, org_slug, project_id, ticket_id, object_key, filename, content_type, byte_size, status, uploaded_by) values ($1, $2, $3, $4, 'T-1', $5, 'image.png', 'image/png', 10, $6, $7)",
      [
        id,
        organizationId,
        `visibility-${organizationId}`,
        projectId,
        `visibility/${id}.png`,
        status,
        userId
      ]
    )

  beforeAll(async () => {
    if (!databaseUrl) throw new Error("Test database URL is required")
    const url = new URL(databaseUrl)
    if (
      !["127.0.0.1", "localhost"].includes(url.hostname) ||
      !url.pathname.startsWith("/projectproject_effect_v4_")
    ) {
      throw new Error("Visibility tests require an isolated local database")
    }
    pool = new Pool({ connectionString: databaseUrl })
    await migrate(drizzle({ client: pool }), {
      migrationsFolder: `${import.meta.dirname}/../../../packages/db/src/migrations`
    })
    await pool.query(
      'insert into "user" (id, name, email, email_verified, created_at, updated_at) values ($1, $2, $3, true, now(), now())',
      [userId, "Visibility test", `${userId}@example.test`]
    )
    await pool.query(
      "insert into organization (id, name, slug, created_at) values ($1, $2, $3, now())",
      [organizationId, "Visibility org", `visibility-${organizationId}`]
    )
    await pool.query(
      "insert into member (id, organization_id, user_id, role, created_at) values ($1, $2, $3, 'owner', now())",
      [randomUUID(), organizationId, userId]
    )
    for (const [id, slug, publishedAt] of [
      [publishedId, "published", "2026-09-22T12:00:00.000Z"],
      [hiddenId, "hidden", null]
    ] as const) {
      await pool.query(
        "insert into project_index (id, slug, organization_id, key, name, icon, color, created_by, published_at) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
        [
          id,
          slug,
          organizationId,
          slug.toUpperCase(),
          slug,
          "folder",
          "#3b82f6",
          userId,
          publishedAt
        ]
      )
      await pool.query(
        "insert into project_member (project_id, organization_id, user_id, role_id) values ($1, $2, $3, 'pm')",
        [id, organizationId, userId]
      )
    }

    const db = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
      )
    )
    const ticketDocs = Layer.mock(TicketDocs, {
      listIds: (orgSlug, projectSlug) => {
        if (orgSlug === `visibility-${organizationId}`)
          reconciledSlugs = [...reconciledSlugs, projectSlug]
        return Effect.succeed([])
      }
    })
    const ticketIndex = TicketIndexLive.pipe(
      Layer.provide(db),
      Layer.provide(ticketDocs),
      Layer.orDie
    )
    ticketIndexLayer = ticketIndex
    projectsLayer = ProjectsLive.pipe(
      Layer.provideMerge(AccessLive),
      Layer.provide(TicketDocumentLock.layer),
      Layer.provide(FinishedStatuses.baseline),
      Layer.provide(
        Layer.mergeAll(
          db,
          ticketIndex,
          ticketDocs,
          Layer.mock(BannerPlaceholders, {}),
          Layer.mock(ProjectDocs, {}),
          Layer.mock(Users, {}),
          Layer.mock(GitHub, {})
        )
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("delete from organization where id = $1", [
        organizationId
      ])
      await pool.query('delete from "user" where id = $1', [userId])
      await pool.end()
    }
  })

  it.layer(
    Layer.suspend(() => Layer.mergeAll(projectsLayer, ticketIndexLayer))
  )((it) => {
    it.effect(
      "hides unpublished projects from public project and ticket access",
      () =>
        Effect.gen(function* () {
          const result = yield* Effect.gen(function* () {
            const projects = yield* Projects
            const access = yield* Access
            const listed = yield* projects.list()
            const scopes = yield* access.projectsInOrg()
            const hiddenProject = yield* Effect.result(
              access.project(`visibility-${organizationId}`, "hidden")
            )
            return { listed, scopes, hiddenProject }
          }).pipe(Effect.provideService(OrgScope, ownerScope), asOwner)
          expect(result.listed.map((project) => project.slug)).toEqual([
            "published"
          ])
          expect(result.scopes.map((scope) => scope.slug)).toEqual([
            "published"
          ])
          expect(result.hiddenProject).toMatchObject({
            _tag: "Failure",
            failure: { _tag: "NotFound" }
          })
          expect(
            yield* Effect.flip(
              Effect.flatMap(TicketIndex, (index) =>
                index.projectFor(`visibility-${organizationId}`, "hidden")
              )
            )
          ).toMatchObject({ _tag: "NotFound" })
        })
    )

    it("returns HTTP 404 for the public hidden-project ticket list route", async () => {
      const ticketsGroup = AppApi.groups.tickets
      const api = HttpApiBuilder.layer(
        HttpApi.make(AppApi.identifier).add(ticketsGroup)
      ).pipe(
        Layer.provide(TicketsHandlerLive),
        Layer.provideMerge(
          Layer.mergeAll(
            Layer.mock(Tickets, {}),
            Layer.mock(TicketQueries.TicketQueries, {})
          )
        ),
        Layer.provide(
          Layer.mergeAll(OrgAccessLive, ProjectAccessLive).pipe(
            Layer.provide(access())
          )
        ),
        Layer.provide(
          Layer.succeed(Authentication, {
            sessionCookie: (httpEffect) =>
              httpEffect.pipe(
                Effect.provideService(CurrentUser, testUser(userId)),
                Effect.provideService(ActivityActor, ActivityActor.user(userId))
              )
          })
        ),
        Layer.provide(apiRouter)
      )
      const { handler, dispose } = HttpRouter.toWebHandler(
        api.pipe(Layer.provideMerge(HttpServer.layerServices))
      )
      try {
        const response = await handler(
          new Request(
            `http://localhost/api/orgs/visibility-${organizationId}/projects/hidden/tickets`,
            { headers: { Cookie: "better-auth.session_token=test" } }
          ),
          Context.empty()
        )
        expect(response.status).toBe(404)
        expect(await response.json()).toEqual({ _tag: "NotFound" })
      } finally {
        void dispose()
      }
    })

    it.effect(
      "skips unpublished projects during index reconciliation while direct migration lookup retains them",
      () =>
        Effect.gen(function* () {
          const summary = yield* Effect.flatMap(TicketIndex, (index) =>
            index.reconcileAllProjects()
          )
          const hidden = yield* Effect.promise(() =>
            pool.query("select id from project_index where id = $1", [hiddenId])
          )
          expect(
            summary.projects
              .filter(
                ({ project }) => project.organizationId === organizationId
              )
              .map(({ project }) => project.projectSlug)
          ).toEqual(["published"])
          expect(reconciledSlugs).toEqual(["published"])
          expect(hidden.rows).toEqual([{ id: hiddenId }])
        })
    )

    it.effect(
      "keeps hidden-only attachment and thumbnail resources from reaching object signing",
      () =>
        Effect.gen(function* () {
          const attachmentId = `hidden-attachment-${randomUUID()}`
          const linkId = `hidden-figma-${randomUUID()}`
          yield* Effect.promise(() => insertAttachment(attachmentId, hiddenId))
          yield* Effect.promise(() =>
            pool.query(
              "insert into figma_link_index (id, organization_id, project_id, file_key, node_id, kind, thumbnail_key) values ($1, $2, $3, 'file-key', null, 'design', 'visibility/thumbnail.png')",
              [linkId, organizationId, hiddenId]
            )
          )
          yield* Effect.promise(() =>
            pool.query(
              "insert into figma_reference (link_id, project_id, ticket_id) values ($1, $2, 'T-1')",
              [linkId, hiddenId]
            )
          )
          let attachmentSigns = 0
          const attachments = yield* Attachments.pipe(
            Effect.flatMap((service) =>
              Effect.exit(
                asOwner(
                  service.resolveForServing(
                    `visibility-${organizationId}`,
                    attachmentId
                  )
                )
              )
            ),
            Effect.provide(
              AttachmentsLive.pipe(
                Layer.provide(dbLayer()),
                Layer.provide(access()),
                Layer.provide(storage),
                Layer.provide(
                  Layer.mock(S3Storage, {
                    presignGet: () =>
                      Effect.sync(() => {
                        attachmentSigns += 1
                        return "https://signed.example/attachment"
                      })
                  })
                )
              )
            )
          )
          let thumbnailSigns = 0
          const thumbnails = yield* FigmaLinks.pipe(
            Effect.flatMap((service) =>
              Effect.exit(
                asOwner(
                  service.resolveThumbnailUrl(
                    `visibility-${organizationId}`,
                    linkId
                  )
                )
              )
            ),
            Effect.provide(
              FigmaLinksLive.pipe(
                Layer.provide(dbLayer()),
                Layer.provide(access()),
                Layer.provide(storage),
                Layer.provide(Layer.mock(Figma, {})),
                Layer.provide(Layer.mock(FigmaIntegrations, {})),
                Layer.provide(
                  Layer.mock(S3Storage, {
                    presignGet: () =>
                      Effect.sync(() => {
                        thumbnailSigns += 1
                        return "https://signed.example/thumbnail"
                      })
                  })
                )
              )
            )
          )
          expect(attachments).toMatchObject({ _tag: "Failure" })
          expect(thumbnails).toMatchObject({ _tag: "Failure" })
          expect(attachmentSigns).toBe(0)
          expect(thumbnailSigns).toBe(0)
        })
    )

    it.effect(
      "serves a genuine orphaned attachment to an organization admin",
      () =>
        Effect.gen(function* () {
          const attachmentId = `orphaned-serving-${randomUUID()}`
          yield* Effect.promise(() =>
            insertAttachment(attachmentId, null, "orphaned")
          )
          let signs = 0
          const result = yield* Attachments.pipe(
            Effect.flatMap((service) =>
              Effect.exit(
                asOwner(
                  service.resolveForServing(
                    `visibility-${organizationId}`,
                    attachmentId
                  )
                )
              )
            ),
            Effect.provide(
              AttachmentsLive.pipe(
                Layer.provide(dbLayer()),
                Layer.provide(access()),
                Layer.provide(storage),
                Layer.provide(
                  Layer.mock(S3Storage, {
                    presignGet: () =>
                      Effect.sync(() => {
                        signs += 1
                        return "https://signed.example/orphan"
                      })
                  })
                )
              )
            )
          )
          expect(result).toMatchObject({
            _tag: "Success",
            value: { url: "https://signed.example/orphan" }
          })
          expect(signs).toBe(1)
        })
    )

    it.effect(
      "shows published and orphaned attachment library records while excluding hidden project data",
      () =>
        Effect.gen(function* () {
          const publishedAttachment = `published-attachment-${randomUUID()}`
          const hiddenAttachment = `hidden-attachment-${randomUUID()}`
          const orphanedAttachment = `orphaned-attachment-${randomUUID()}`
          yield* Effect.promise(() =>
            insertAttachment(publishedAttachment, publishedId)
          )
          yield* Effect.promise(() =>
            insertAttachment(hiddenAttachment, hiddenId)
          )
          yield* Effect.promise(() =>
            insertAttachment(orphanedAttachment, null, "orphaned")
          )
          yield* Effect.promise(() =>
            pool.query(
              "insert into attachment_reference (attachment_id, project_id, ticket_id) values ($1, $2, 'T-1'), ($1, $3, 'T-2')",
              [publishedAttachment, publishedId, hiddenId]
            )
          )
          const result = yield* Attachments.pipe(
            Effect.flatMap((service) =>
              Effect.all({
                page: service.listForOrg({}),
                summary: service.summarizeForOrg()
              })
            ),
            Effect.provideService(OrgScope, ownerScope),
            Effect.provide(
              AttachmentsLive.pipe(
                Layer.provide(dbLayer()),
                Layer.provide(access()),
                Layer.provide(storage),
                Layer.provide(Layer.mock(S3Storage, {}))
              )
            )
          )
          const ids = result.page.items.map((item) => item.id)
          expect(ids).toContain(publishedAttachment)
          expect(ids).toContain(orphanedAttachment)
          expect(ids).not.toContain(hiddenAttachment)
          expect(
            result.page.items.find((item) => item.id === publishedAttachment)
              ?.tickets
          ).toEqual([{ projectSlug: "published", ticketId: "T-1" }])
          expect(result.summary.count).toBe(3)
        })
    )

    it.effect(
      "refuses to delete a hidden-project attachment from the organization library",
      () =>
        Effect.gen(function* () {
          const attachmentId = `hidden-delete-${randomUUID()}`
          yield* Effect.promise(() => insertAttachment(attachmentId, hiddenId))
          let deletedObjects = 0
          const result = yield* Attachments.pipe(
            Effect.flatMap((service) =>
              Effect.exit(service.deleteForOrg(attachmentId))
            ),
            Effect.provideService(OrgScope, ownerScope),
            Effect.provide(
              AttachmentsLive.pipe(
                Layer.provide(dbLayer()),
                Layer.provide(access()),
                Layer.provide(storage),
                Layer.provide(
                  Layer.mock(S3Storage, {
                    deleteObject: () =>
                      Effect.sync(() => {
                        deletedObjects += 1
                      })
                  })
                )
              )
            )
          )
          expect(result).toMatchObject({ _tag: "Failure" })
          expect(deletedObjects).toBe(0)
          expect(
            yield* Effect.promise(() =>
              pool.query("select id from attachment_index where id = $1", [
                attachmentId
              ])
            )
          ).toMatchObject({ rowCount: 1 })
        })
    )

    it("backfills existing projects from created_at and defaults newly inserted projects to published", async () => {
      const createdAt = "2024-01-02T03:04:05.000Z"
      const schema = `migration_visibility_${randomUUID().replaceAll("-", "")}`
      const migration = await readFile(
        new URL(
          "../../../packages/db/src/migrations/20260922120000_jira_effect_workflow/migration.sql",
          import.meta.url
        ),
        "utf8"
      )
      const client = await pool.connect()
      try {
        await client.query("begin")
        await client.query(`create schema "${schema}"`)
        await client.query(`set local search_path to "${schema}"`)
        await client.query(
          "create table project_index (slug text primary key, created_at timestamp with time zone not null)"
        )
        await client.query("create table jira_migration (id uuid not null)")
        await client.query(
          "insert into project_index (slug, created_at) values ('legacy', $1)",
          [createdAt]
        )
        for (const statement of migration.split("--> statement-breakpoint")) {
          const sql = statement.trim()
          if (sql !== "") await client.query(sql)
        }
        await client.query(
          "insert into project_index (slug, created_at) values ('default', now())"
        )
        const rows = await client.query(
          "select slug, created_at, published_at from project_index order by slug"
        )

        expect(
          rows.rows.find((row) => row.slug === "legacy")?.published_at
        ).toEqual(rows.rows.find((row) => row.slug === "legacy")?.created_at)
        expect(
          rows.rows.find((row) => row.slug === "default")?.published_at
        ).not.toBeNull()
      } finally {
        await client.query("rollback")
        client.release()
      }
    })
  })
})
