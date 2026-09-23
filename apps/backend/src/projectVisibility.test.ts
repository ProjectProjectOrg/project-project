import { randomUUID } from "node:crypto"
// @effect-diagnostics-next-line nodeBuiltinImport:off
import { readFile } from "node:fs/promises"

import { PgClient } from "@effect/sql-pg"
import { Db, DbLive } from "@pp/db"
import { Attachments } from "@pp/server-core/attachments/Attachments"
import { AttachmentsLive } from "@pp/server-core/attachments/AttachmentsLive"
import { Comments } from "@pp/server-core/comments/Comments"
import { Figma } from "@pp/server-core/figma/Figma"
import { FigmaIntegrations } from "@pp/server-core/figma/FigmaIntegrations"
import { FigmaLinks } from "@pp/server-core/figma/FigmaLinks"
import { FigmaLinksLive } from "@pp/server-core/figma/FigmaLinksLive"
import { GitHub } from "@pp/server-core/github/GitHub"
import { Groups } from "@pp/server-core/groups/Groups"
import { CurrentOrg } from "@pp/server-core/organizations/CurrentOrg"
import { BannerPlaceholders } from "@pp/server-core/projects/BannerPlaceholders"
import { ProjectDocs } from "@pp/server-core/projects/ProjectDocs"
import { Projects } from "@pp/server-core/projects/Projects"
import { ProjectsLive } from "@pp/server-core/projects/ProjectsLive"
import { OrgStorage } from "@pp/server-core/storage/OrgStorage"
import { S3Storage } from "@pp/server-core/storage/S3Storage"
import { TicketDocs } from "@pp/server-core/tickets/TicketDocs"
import * as TicketDocumentLock from "@pp/server-core/tickets/ticketDocumentLock"
import { TicketIndex } from "@pp/server-core/tickets/TicketIndex"
import { TicketIndexLive } from "@pp/server-core/tickets/TicketIndexLive"
import { TicketsLive } from "@pp/server-core/tickets/TicketsLive"
import { Users } from "@pp/server-core/users/Users"
import { AppApi, Authentication, CurrentUser, NotFound } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Redacted from "effect/Redacted"
import { HttpRouter, HttpServer } from "effect/unstable/http"
import { HttpApi, HttpApiBuilder } from "effect/unstable/httpapi"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { TicketsHandlerLive } from "./handlers/tickets"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("published project visibility", () => {
  const userId = randomUUID()
  const organizationId = randomUUID()
  const publishedId = randomUUID()
  const hiddenId = randomUUID()
  let pool: Pool
  let projectsRuntime: ManagedRuntime.ManagedRuntime<Projects, never>
  let ticketIndexRuntime: ManagedRuntime.ManagedRuntime<TicketIndex, never>
  let reconciledSlugs: ReadonlyArray<string> = []

  const dbLayer = () =>
    DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl!), maxConnections: 1 })
      )
    )

  const ownerOrg = Layer.succeed(CurrentOrg, {
    resolve: () =>
      Effect.succeed({
        organizationId,
        orgSlug: `visibility-${organizationId}`,
        role: "owner" as const
      })
  })

  const apiRouter = Layer.effect(
    HttpRouter.HttpRouter,
    Effect.map(HttpRouter.HttpRouter, (router) => router.prefixed("/api"))
  )

  const nonMemberProjects = Layer.succeed(Projects, {
    requireMember: () => Effect.fail(new NotFound())
  } as never)

  const storage = Layer.succeed(OrgStorage, {
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
  } as never)

  const insertAttachment = (id: string, projectSlug: string, status = "live") =>
    pool.query(
      "insert into attachment_index (id, organization_id, org_slug, project_slug, ticket_id, object_key, filename, content_type, byte_size, status, uploaded_by) values ($1, $2, $3, $4, 'T-1', $5, 'image.png', 'image/png', 10, $6, $7)",
      [
        id,
        organizationId,
        `visibility-${organizationId}`,
        projectSlug,
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
        "insert into project_member (project_slug, project_id, user_id, role) values ($1, $2, $3, 'owner')",
        [slug, id, userId]
      )
    }

    const db = DbLive.pipe(
      Layer.provideMerge(
        PgClient.layer({ url: Redacted.make(databaseUrl), maxConnections: 1 })
      )
    )
    const ticketDocs = Layer.mock(TicketDocs, {
      listIds: (_orgSlug, projectSlug) => {
        reconciledSlugs = [...reconciledSlugs, projectSlug]
        return Effect.succeed([])
      }
    })
    const ticketIndex = TicketIndexLive.pipe(
      Layer.provide(db),
      Layer.provide(ticketDocs),
      Layer.orDie
    )
    ticketIndexRuntime = ManagedRuntime.make(ticketIndex)
    projectsRuntime = ManagedRuntime.make(
      ProjectsLive.pipe(
        Layer.provide(TicketDocumentLock.layer),
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
    )
  })

  afterAll(async () => {
    await projectsRuntime?.dispose()
    await ticketIndexRuntime?.dispose()
    if (pool) {
      await pool.query("delete from organization where id = $1", [
        organizationId
      ])
      await pool.query('delete from "user" where id = $1', [userId])
      await pool.end()
    }
  })

  it("hides unpublished projects from public project and ticket access", async () => {
    const result = await projectsRuntime.runPromise(
      Effect.gen(function* () {
        const projects = yield* Projects
        const listed = yield* projects.list(
          `visibility-${organizationId}`,
          userId
        )
        const hiddenProject = yield* Effect.result(
          projects.get(`visibility-${organizationId}`, userId, "hidden")
        )
        const hiddenMembership = yield* Effect.result(
          projects.requireMember(
            `visibility-${organizationId}`,
            userId,
            "hidden"
          )
        )
        return { listed, hiddenProject, hiddenMembership }
      })
    )

    expect(result.listed.map((project) => project.slug)).toEqual(["published"])
    expect(result.hiddenProject).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "NotFound" }
    })
    expect(result.hiddenMembership).toMatchObject({
      _tag: "Failure",
      failure: { _tag: "NotFound" }
    })
    await expect(
      ticketIndexRuntime.runPromise(
        Effect.flatMap(TicketIndex, (index) =>
          index.projectFor(`visibility-${organizationId}`, "hidden")
        )
      )
    ).rejects.toMatchObject({ _tag: "NotFound" })
  })

  it("returns HTTP 404 for the public hidden-project ticket list route", async () => {
    const ticketsGroup = AppApi.groups.tickets
    const projects = Layer.succeed(Projects, {
      requireMember: (orgSlug: string, memberId: string, slug: string) =>
        Effect.tryPromise({
          try: () =>
            projectsRuntime.runPromise(
              Effect.flatMap(Projects, (service) =>
                service.requireMember(orgSlug, memberId, slug)
              )
            ),
          catch: (error) => error as NotFound
        }).pipe(Effect.mapError(() => new NotFound()))
    } as never)
    const tickets = TicketsLive.pipe(
      Layer.provide(Layer.succeed(TicketDocs, {} as never)),
      Layer.provide(projects),
      Layer.provide(Layer.succeed(GitHub, {} as never)),
      Layer.provide(Layer.succeed(Groups, {} as never)),
      Layer.provide(Layer.succeed(Comments, {} as never)),
      Layer.provide(Layer.succeed(Attachments, {} as never)),
      Layer.provide(Layer.succeed(FigmaLinks, {} as never)),
      Layer.provide(Layer.succeed(Users, {} as never)),
      Layer.provide(Layer.succeed(Db, {} as never)),
      Layer.provide(Layer.succeed(TicketIndex, {} as never)),
      Layer.provideMerge(TicketDocumentLock.layer)
    )
    const api = HttpApiBuilder.layer(
      HttpApi.make(AppApi.identifier).add(ticketsGroup)
    ).pipe(
      Layer.provide(TicketsHandlerLive),
      Layer.provide(tickets),
      Layer.provide(ownerOrg),
      Layer.provide(
        Layer.succeed(Authentication, {
          sessionCookie: (httpEffect) =>
            Effect.provideService(httpEffect, CurrentUser, {
              id: userId
            } as never)
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
        Context.empty() as never
      )
      expect(response.status).toBe(404)
      expect(await response.json()).toEqual({ _tag: "NotFound" })
    } finally {
      void dispose()
    }
  })

  it("skips unpublished projects during index reconciliation while direct migration lookup retains them", async () => {
    const summary = await ticketIndexRuntime.runPromise(
      Effect.flatMap(TicketIndex, (index) => index.reconcileAllProjects())
    )
    const hidden = await pool.query(
      "select id from project_index where id = $1",
      [hiddenId]
    )

    expect(summary.projects.map(({ project }) => project.projectSlug)).toEqual([
      "published"
    ])
    expect(reconciledSlugs).toEqual(["published"])
    expect(hidden.rows).toEqual([{ id: hiddenId }])
  })

  it("keeps hidden-only attachment and thumbnail resources from reaching object signing", async () => {
    const attachmentId = `hidden-attachment-${randomUUID()}`
    const linkId = `hidden-figma-${randomUUID()}`
    await insertAttachment(attachmentId, "hidden")
    await pool.query(
      "insert into figma_link_index (id, organization_id, org_slug, project_slug, file_key, node_id, kind, thumbnail_key) values ($1, $2, $3, 'hidden', 'file-key', null, 'design', 'visibility/thumbnail.png')",
      [linkId, organizationId, `visibility-${organizationId}`]
    )
    await pool.query(
      "insert into figma_reference (link_id, org_slug, project_slug, ticket_id) values ($1, $2, 'hidden', 'T-1')",
      [linkId, `visibility-${organizationId}`]
    )

    let attachmentSigns = 0
    const attachments = await Effect.runPromise(
      Attachments.pipe(
        Effect.flatMap((service) =>
          Effect.exit(
            service.resolveForServing(
              `visibility-${organizationId}`,
              attachmentId,
              userId
            )
          )
        ),
        Effect.provide(
          AttachmentsLive.pipe(
            Layer.provide(dbLayer()),
            Layer.provide(ownerOrg),
            Layer.provide(storage),
            Layer.provide(nonMemberProjects),
            Layer.provide(
              Layer.succeed(S3Storage, {
                presignGet: () =>
                  Effect.sync(() => {
                    attachmentSigns += 1
                    return "https://signed.example/attachment"
                  })
              } as never)
            )
          )
        )
      )
    )

    let thumbnailSigns = 0
    const thumbnails = await Effect.runPromise(
      FigmaLinks.pipe(
        Effect.flatMap((service) =>
          Effect.exit(
            service.resolveThumbnailUrl(
              `visibility-${organizationId}`,
              userId,
              linkId
            )
          )
        ),
        Effect.provide(
          FigmaLinksLive.pipe(
            Layer.provide(dbLayer()),
            Layer.provide(ownerOrg),
            Layer.provide(storage),
            Layer.provide(nonMemberProjects),
            Layer.provide(Layer.succeed(Figma, {} as never)),
            Layer.provide(Layer.succeed(FigmaIntegrations, {} as never)),
            Layer.provide(
              Layer.succeed(S3Storage, {
                presignGet: () =>
                  Effect.sync(() => {
                    thumbnailSigns += 1
                    return "https://signed.example/thumbnail"
                  })
              } as never)
            )
          )
        )
      )
    )

    expect(attachments).toMatchObject({ _tag: "Failure" })
    expect(thumbnails).toMatchObject({ _tag: "Failure" })
    expect(attachmentSigns).toBe(0)
    expect(thumbnailSigns).toBe(0)
  })

  it("serves a genuine orphaned attachment to an organization admin", async () => {
    const attachmentId = `orphaned-serving-${randomUUID()}`
    await insertAttachment(attachmentId, "deleted-project", "orphaned")
    let signs = 0
    const result = await Effect.runPromise(
      Attachments.pipe(
        Effect.flatMap((service) =>
          Effect.exit(
            service.resolveForServing(
              `visibility-${organizationId}`,
              attachmentId,
              userId
            )
          )
        ),
        Effect.provide(
          AttachmentsLive.pipe(
            Layer.provide(dbLayer()),
            Layer.provide(ownerOrg),
            Layer.provide(storage),
            Layer.provide(nonMemberProjects),
            Layer.provide(
              Layer.succeed(S3Storage, {
                presignGet: () =>
                  Effect.sync(() => {
                    signs += 1
                    return "https://signed.example/orphan"
                  })
              } as never)
            )
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

  it("shows published and orphaned attachment library records while excluding hidden project data", async () => {
    const publishedAttachment = `published-attachment-${randomUUID()}`
    const hiddenAttachment = `hidden-attachment-${randomUUID()}`
    const orphanedAttachment = `orphaned-attachment-${randomUUID()}`
    await insertAttachment(publishedAttachment, "published")
    await insertAttachment(hiddenAttachment, "hidden")
    await insertAttachment(orphanedAttachment, "deleted-project", "orphaned")
    await pool.query(
      "insert into attachment_reference (attachment_id, org_slug, project_slug, ticket_id) values ($1, $2, 'published', 'T-1'), ($1, $2, 'hidden', 'T-2')",
      [publishedAttachment, `visibility-${organizationId}`]
    )

    const result = await Effect.runPromise(
      Attachments.pipe(
        Effect.flatMap((service) =>
          Effect.all({
            page: service.listForOrg(
              `visibility-${organizationId}`,
              userId,
              {}
            ),
            summary: service.summarizeForOrg(
              `visibility-${organizationId}`,
              userId
            )
          })
        ),
        Effect.provide(
          AttachmentsLive.pipe(
            Layer.provide(dbLayer()),
            Layer.provide(ownerOrg),
            Layer.provide(storage),
            Layer.provide(nonMemberProjects),
            Layer.provide(Layer.succeed(S3Storage, {} as never))
          )
        )
      )
    )

    const ids = result.page.items.map((item) => item.id)
    expect(ids).toContain(publishedAttachment)
    expect(ids).toContain(orphanedAttachment)
    expect(ids).not.toContain(hiddenAttachment)
    expect(
      result.page.items.find((item) => item.id === publishedAttachment)?.tickets
    ).toEqual([{ projectSlug: "published", ticketId: "T-1" }])
    expect(result.summary.count).toBe(3)
  })

  it("refuses to delete a hidden-project attachment from the organization library", async () => {
    const attachmentId = `hidden-delete-${randomUUID()}`
    await insertAttachment(attachmentId, "hidden")
    let deletedObjects = 0
    const result = await Effect.runPromise(
      Attachments.pipe(
        Effect.flatMap((service) =>
          Effect.exit(
            service.deleteForOrg(
              `visibility-${organizationId}`,
              attachmentId,
              userId
            )
          )
        ),
        Effect.provide(
          AttachmentsLive.pipe(
            Layer.provide(dbLayer()),
            Layer.provide(ownerOrg),
            Layer.provide(storage),
            Layer.provide(nonMemberProjects),
            Layer.provide(
              Layer.succeed(S3Storage, {
                deleteObject: () =>
                  Effect.sync(() => {
                    deletedObjects += 1
                  })
              } as never)
            )
          )
        )
      )
    )

    expect(result).toMatchObject({ _tag: "Failure" })
    expect(deletedObjects).toBe(0)
    expect(
      await pool.query("select id from attachment_index where id = $1", [
        attachmentId
      ])
    ).toMatchObject({ rowCount: 1 })
  })

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
