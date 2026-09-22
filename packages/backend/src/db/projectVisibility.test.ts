import { randomUUID } from "node:crypto"
import { PgClient } from "@effect/sql-pg"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect, it } from "vite-plus/test"
import { DbLive } from "../Layers/Db"
import { ProjectsLive } from "../Layers/Projects"
import { TicketIndexLive } from "../Layers/TicketIndex"
import { BannerPlaceholders } from "../Services/BannerPlaceholders"
import { GitHub } from "../Services/GitHub"
import { ProjectDocs } from "../Services/ProjectDocs"
import { Projects } from "../Services/Projects"
import { TicketDocs } from "../Services/TicketDocs"
import { TicketIndex } from "../Services/TicketIndex"
import { Users } from "../Services/Users"
import * as TicketDocumentLock from "../ticketDocumentLock"

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
      migrationsFolder: `${import.meta.dirname}/migrations`
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
})
