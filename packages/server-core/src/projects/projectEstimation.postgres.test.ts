// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  ActivityActor,
  DEFAULT_TICKET_SORT,
  ProjectScope,
  Validation
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { accessLayer, projectScope } from "../access/testing"
import { testActivityLayer } from "../activity/testing"
import { Attachments } from "../attachments/Attachments"
import { Comments } from "../comments/Comments"
import { FigmaLinks } from "../figma/FigmaLinks"
import { GitHub } from "../github/GitHub"
import { Groups } from "../groups/Groups"
import { Library } from "../library/Library"
import * as TicketServices from "../tickets/layer"
import * as TicketCommands from "../tickets/TicketCommands"
import { TicketDocs } from "../tickets/TicketDocs"
import * as TicketDocumentLock from "../tickets/ticketDocumentLock"
import * as TicketQueries from "../tickets/TicketQueries"
import { Users } from "../users/Users"
import { FinishedStatuses } from "./FinishedStatuses"
import { gitAutomationTestLayer } from "./gitAutomationTesting"
import { ProjectDocs, type ProjectDocument } from "./ProjectDocs"
import { Projects } from "./Projects"
import { projectsOnPostgres } from "./projectsOnPostgres"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL

describe.skipIf(!databaseUrl)("markdown estimation authority", () => {
  const id = randomUUID()
  const scope = projectScope("member", "pm", {
    userId: id,
    organizationId: id,
    projectId: id,
    orgSlug: id,
    slug: "project"
  })
  let pool: Pool
  let layer: Layer.Layer<
    Projects | TicketCommands.TicketCommands | TicketQueries.TicketQueries
  >
  let document: ProjectDocument = {
    slug: "project",
    name: "Project",
    icon: "folder",
    color: "#3b82f6",
    createdAt: DateTime.toDateUtc(DateTime.makeUnsafe("2026-01-01T00:00:00Z")),
    github: null,
    estimation: "points",
    templateDefaults: {},
    body: "Project body",
    setup: {
      workflowReviewedAt: null,
      invitePeopleDismissedAt: null,
      connectGithubDismissedAt: null
    }
  }
  const docs = Layer.mock(ProjectDocs, {
    read: () => Effect.sync(() => document),
    write: (_org, _slug, next) =>
      Effect.sync(() => {
        document = { ...next, templateDefaults: {} }
      })
  })

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
      [id, `${id}@example.test`]
    )
    await pool.query(
      "INSERT INTO organization (id,name,slug,created_at) VALUES ($1,$1,$1,now())",
      [id]
    )
    await pool.query(
      "INSERT INTO member (id,organization_id,user_id,role,created_at) VALUES ($1,$1,$1,'member',now())",
      [id]
    )
    await pool.query(
      "INSERT INTO project_index (id,organization_id,slug,key,name,icon,color,created_by) VALUES ($1,$2,'project','T','Project','folder','#3b82f6',$3)",
      [id, id, id]
    )
    await pool.query(
      "INSERT INTO project_member (project_id,organization_id,user_id,role_id) VALUES ($1,$2,$3,'pm')",
      [id, id, id]
    )
    await pool.query(
      "INSERT INTO ticket_index (organization_id,project_id,ticket_id,title,status,type,priority,estimate_unit,estimate_value,created_by,created_at,updated_at) VALUES ($1,$2,'T-1','Estimated','todo','other','med','points',5,$1,now(),now()), ($1,$2,'T-2','Unestimated','todo','other','med',null,null,$1,now(),now())",
      [id, id]
    )
    const db = DbLive.pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
    )
    layer = TicketServices.layer
      .pipe(
        Layer.provide(gitAutomationTestLayer()),
        Layer.provideMerge(projectsOnPostgres(databaseUrl, [id], {}, docs)),
        Layer.provide(docs),
        Layer.provide(testActivityLayer(id)),
        Layer.provide(FinishedStatuses.layer.pipe(Layer.provide(db))),
        Layer.provide(db),
        Layer.provide(TicketDocumentLock.layer),
        Layer.provide(accessLayer({})),
        Layer.provide(
          Layer.mergeAll(
            Layer.mock(TicketDocs, {}),
            Layer.mock(GitHub, {}),
            Layer.mock(Groups, {}),
            Layer.mock(Comments, {}),
            Layer.mock(Attachments, {}),
            Layer.mock(FigmaLinks, {}),
            Layer.mock(Users, {}),
            Layer.mock(Library, {})
          )
        )
      )
      .pipe(Layer.orDie)
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [id])
    await pool.query('DELETE FROM "user" WHERE id = $1', [id])
    await pool.end()
  })

  it.effect(
    "reconciles before ticket queries and validation, and preserves file settings on unrelated writes",
    () =>
      Effect.gen(function* () {
        const tickets = yield* TicketCommands.TicketCommands
        const queries = yield* TicketQueries.TicketQueries
        const projects = yield* Projects
        const sorted = yield* queries.list({
          sort: { key: "estimate", dir: "asc" }
        })
        expect(sorted.items.map(({ ticket }) => ticket.id)).toEqual([
          "T-2",
          "T-1"
        ])
        expect((yield* queries.count({ estimate: ["any"] })).total).toBe(1)
        expect((yield* projects.get()).estimation).toBe("points")

        document = { ...document, estimation: "tshirt" }
        const rejected = yield* Effect.flip(
          tickets.update("T-1", { estimate: { unit: "points", value: 3 } })
        )
        expect(rejected).toEqual(
          new Validation({ reason: "estimate_unit_mismatch:points:tshirt" })
        )
        expect(
          (yield* queries.list({
            estimate: ["stale"],
            sort: DEFAULT_TICKET_SORT
          })).items.map(({ ticket }) => ticket.id)
        ).toEqual(["T-1"])

        document = { ...document, estimation: "time" }
        expect(
          (yield* projects.update({ body: "Edited body" })).estimation
        ).toBe("time")
        expect(document).toMatchObject({
          estimation: "time",
          body: "Edited body"
        })
        const mirror = yield* Effect.promise(() =>
          pool.query("SELECT estimation FROM project_index WHERE id = $1", [id])
        )
        expect(mirror.rows).toEqual([{ estimation: "time" }])

        document = { ...document, estimation: "off" }
        expect((yield* projects.get()).estimation).toBe("off")
        expect((yield* queries.count({ estimate: ["any"] })).total).toBe(0)
        yield* projects.update({ estimation: "points" })
        expect(document.estimation).toBe("points")
      }).pipe(
        Effect.provideService(ProjectScope, scope),
        Effect.provideService(ActivityActor, ActivityActor.user(id)),
        Effect.provide(layer)
      )
  )
})
