// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import { CurrentUser, OrgScope, ProjectScope } from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Tracer from "effect/Tracer"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import * as Access from "../access/Access"
import { projectScope, testUser } from "../access/testing"
import { asUser } from "../activity/testing"
import { Bots } from "../bots/Bots"
import * as ProjectDocs from "./ProjectDocs"
import * as Projects from "./Projects"
import { projectsOnPostgres } from "./projectsOnPostgres"
import * as SystemProjects from "./SystemProjects"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

const recordingTracer = () => {
  const spans: Array<Tracer.NativeSpan> = []
  const tracer = Tracer.make({
    span: (options) => {
      const span = new Tracer.NativeSpan(options)
      spans.push(span)
      return span
    }
  })
  const named = (name: string) =>
    spans.flatMap((span) =>
      span.name === name ? [Object.fromEntries(span.attributes)] : []
    )
  const parentOf = (name: string) =>
    spans.flatMap((span) =>
      span.name === name
        ? [
            Option.match(span.parent, {
              onNone: () => null,
              onSome: (parent) =>
                spans.find((other) => other.spanId === parent.spanId)?.name ??
                null
            })
          ]
        : []
    )
  return { tracer, named, parentOf }
}

describe.skipIf(!databaseUrl)("project catalog", () => {
  const organizationId = randomUUID()
  const userId = randomUUID()
  const slugs = ["oldest", "middle", "newest"].map(
    (name) => `${name}-${organizationId}`
  )
  let pool: Pool
  let layer: ReturnType<typeof projectsOnPostgres>

  const inOrg = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideServiceEffect(
        OrgScope,
        Effect.flatMap(Access.Access, (access) =>
          access.org(organizationId)
        ).pipe(Effect.provideService(CurrentUser, testUser(userId)))
      ),
      asUser(userId),
      Effect.provide(layer)
    )

  const inProject = <A, E, R>(slug: string, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideServiceEffect(
        ProjectScope,
        Effect.flatMap(Access.Access, (access) =>
          access.project(organizationId, slug)
        ).pipe(Effect.provideService(CurrentUser, testUser(userId)))
      ),
      asUser(userId),
      Effect.provide(layer)
    )

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
      'INSERT INTO "user" (id,name,email,created_at,updated_at) VALUES ($1,$1,$2,now(),now())',
      [userId, `${userId}@example.test`]
    )
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [organizationId]
    )
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$2,$3,'member',now())",
      [randomUUID(), organizationId, userId]
    )
    for (const [index, slug] of slugs.entries()) {
      const projectId = randomUUID()
      await pool.query(
        "INSERT INTO project_index (id,slug,organization_id,key,name,icon,color,created_by,created_at) VALUES ($1,$2,$3,$4,$2,'folder','#3b82f6',$5,$6)",
        [
          projectId,
          slug,
          organizationId,
          `C${index}`,
          userId,
          DateTime.toDateUtc(
            DateTime.makeUnsafe(`2026-01-0${index + 1}T00:00:00Z`)
          )
        ]
      )
      await pool.query(
        "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'pm')",
        [projectId, organizationId, userId]
      )
    }
    layer = projectsOnPostgres(databaseUrl, [userId])
  })

  afterAll(async () => {
    if (pool) {
      await pool.query("DELETE FROM organization WHERE id=$1", [organizationId])
      await pool.query('DELETE FROM "user" WHERE id=$1', [userId])
      await pool.end()
    }
  })

  it.effect("pages projects newest first", () =>
    Effect.gen(function* () {
      const first = yield* inOrg(
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.listPaged(undefined, 2)
        )
      )
      const all = yield* inOrg(
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.listPaged(undefined, 10)
        )
      )
      expect(first.items.map((project) => project.slug)).toEqual([
        slugs[2],
        slugs[1]
      ])
      expect(first.nextCursor).not.toBeNull()
      expect(all.items.map((project) => project.slug)).toEqual(
        slugs.toReversed()
      )
      expect(all.nextCursor).toBeNull()
    })
  )

  it.effect("records a setup step and keeps the others", () =>
    Effect.gen(function* () {
      const dismissedAt = DateTime.toDateUtc(
        DateTime.makeUnsafe("2026-10-01T00:00:00Z")
      )
      const detail = yield* inProject(
        slugs[0],
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.updateSetup({ invitePeopleDismissedAt: dismissedAt })
        )
      )
      expect(detail.setup).toEqual({
        workflowReviewedAt: null,
        invitePeopleDismissedAt: dismissedAt,
        connectGithubDismissedAt: null
      })
    })
  )

  it.effect("traces each operation once under its Projects span", () =>
    Effect.gen(function* () {
      const { tracer, named } = recordingTracer()
      yield* inOrg(
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.listPaged(undefined, 2)
        )
      ).pipe(Effect.withTracer(tracer))
      yield* inProject(
        slugs[1],
        Effect.flatMap(Projects.Projects, (projects) => projects.get())
      ).pipe(Effect.withTracer(tracer))
      expect(named("Projects.list")).toEqual([
        expect.objectContaining({
          module: "Projects",
          operation: "list",
          orgSlug: organizationId,
          userId
        })
      ])
      expect(named("Projects.get")).toEqual([
        expect.objectContaining({
          module: "Projects",
          operation: "get",
          orgSlug: organizationId,
          slug: slugs[1],
          userId
        })
      ])
    })
  )

  it.effect("traces the project write lock under the call that takes it", () =>
    Effect.gen(function* () {
      const { tracer, named, parentOf } = recordingTracer()
      yield* inProject(
        slugs[0],
        Effect.flatMap(Projects.Projects, (projects) =>
          projects.updateSetup({ workflowReviewedAt: null })
        )
      ).pipe(Effect.withTracer(tracer))
      expect(named("ProjectDetails.withWriteLock")).toEqual([{}])
      expect(parentOf("ProjectDetails.withWriteLock")).toEqual([
        "Projects.updateSetup"
      ])
    })
  )

  it.effect("traces SystemProjects.ensure with its role and org", () =>
    Effect.gen(function* () {
      const { tracer, named, parentOf } = recordingTracer()
      const systemProjects = SystemProjects.layer.pipe(
        Layer.provide(
          DbLive.pipe(
            Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl!) }))
          )
        ),
        Layer.provide(
          Layer.mock(Bots, {
            projectScope: (_bot, orgSlug, slug) =>
              Effect.succeed(projectScope("owner", "pm", { orgSlug, slug }))
          })
        ),
        Layer.provide(Layer.mock(Projects.Projects, {})),
        Layer.provide(
          Layer.mock(ProjectDocs.ProjectDocs, {
            systemRole: (_org, slug) =>
              Effect.succeed(
                slug === slugs[1] ? Option.some("feedback") : Option.none()
              )
          })
        ),
        Layer.orDie
      )
      const scope = yield* Effect.flatMap(
        SystemProjects.SystemProjects,
        (projects) =>
          projects.ensure({
            role: "feedback",
            orgSlug: organizationId,
            name: "Feedback",
            key: "FB",
            bot: { key: "feedback", name: "Feedback", role: "developer" }
          })
      ).pipe(Effect.withTracer(tracer), Effect.provide(systemProjects))
      expect(scope.slug).toBe(slugs[1])
      expect(named("SystemProjects.ensure")).toEqual([
        { role: "feedback", orgSlug: organizationId }
      ])
      expect(parentOf("SystemProjects.ensure")).toEqual([null])
      expect(parentOf("SystemProjects.find")).toEqual(["SystemProjects.ensure"])
    })
  )
})
