// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  ActivityActor,
  Forbidden,
  ProjectScope,
  StatusColor,
  StatusLabel
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import { TicketIndex } from "../tickets/TicketIndex"
import { Tickets } from "../tickets/Tickets"
import { ProjectStatuses } from "./ProjectStatuses"
import { ProjectStatusesLive } from "./ProjectStatusesLive"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const label = Schema.decodeSync(StatusLabel)

describe.skipIf(!databaseUrl)("project status descriptions", () => {
  const id = randomUUID()
  const scope = projectScope("member", "pm", {
    userId: id,
    organizationId: id,
    projectId: id,
    orgSlug: id,
    slug: "project"
  })
  let pool: Pool
  let layer: Layer.Layer<ProjectStatuses>

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
      "INSERT INTO project_index (id,organization_id,slug,key,name,icon,color,created_by) VALUES ($1,$2,'project','T','Project','folder','#3b82f6',$3)",
      [id, id, id]
    )
    await pool.query(
      "INSERT INTO project_status (project_id,slug,label,icon,color,order_key,created_by) VALUES ($1,'todo','Todo','Circle','#a3a3a3','a0',$2), ($1,'in_review','In review','Eye','#e0a03b','a1',$2)",
      [id, id]
    )
    layer = ProjectStatusesLive.pipe(
      Layer.provide(Layer.mock(TicketIndex, {})),
      Layer.provide(Layer.mock(Tickets, {})),
      Layer.provide(
        DbLive.pipe(
          Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl) }))
        )
      ),
      Layer.orDie
    )
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [id])
    await pool.query('DELETE FROM "user" WHERE id = $1', [id])
    await pool.end()
  })

  const run = <A, E>(
    effect: Effect.Effect<A, E, ProjectStatuses | ProjectScope | ActivityActor>
  ) =>
    effect.pipe(
      Effect.provideService(ProjectScope, scope),
      Effect.provideService(ActivityActor, ActivityActor.user(id)),
      Effect.provide(layer)
    )

  it.effect("saves, keeps and clears a status description", () =>
    run(
      Effect.gen(function* () {
        const statuses = yield* ProjectStatuses
        const described = yield* statuses.update("in_review", {
          description: "A PR is open and waiting for review"
        })
        expect(described.description).toBe(
          "A PR is open and waiting for review"
        )

        const recoloured = yield* statuses.update("in_review", {
          color: StatusColor.make("#22c55e")
        })
        expect(recoloured.description).toBe(
          "A PR is open and waiting for review"
        )

        const cleared = yield* statuses.update("in_review", {
          description: null
        })
        expect(cleared.description).toBeNull()
      })
    )
  )

  it.effect(
    "lets a baseline status take a description but not a new label",
    () =>
      run(
        Effect.gen(function* () {
          const statuses = yield* ProjectStatuses
          const described = yield* statuses.update("todo", {
            description: "Refined and ready to pick up"
          })
          expect(described).toMatchObject({
            slug: "todo",
            label: "Todo",
            description: "Refined and ready to pick up"
          })

          const renamed = yield* Effect.flip(
            statuses.update("todo", { label: label("Backlog") })
          )
          expect(renamed).toBeInstanceOf(Forbidden)
          expect((yield* statuses.list())[0].label).toBe("Todo")
        })
      )
  )
})
