// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  ActivityActor,
  Conflict,
  Forbidden,
  OrderKey,
  ProjectScope,
  StatusColor,
  StatusLabel
} from "@pp/shared"
import { drizzle } from "drizzle-orm/node-postgres"
import { migrate } from "drizzle-orm/node-postgres/migrator"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Redacted from "effect/Redacted"
import * as Schema from "effect/Schema"
import * as Tracer from "effect/Tracer"
import { Pool } from "pg"
import { afterAll, beforeAll, describe, expect } from "vitest"

import { projectScope } from "../access/testing"
import * as TicketIndex from "../tickets/TicketIndex"
import * as TicketRewrites from "../tickets/TicketRewrites"
import * as ProjectStatuses from "./ProjectStatuses"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const label = Schema.decodeSync(StatusLabel)

describe.skipIf(!databaseUrl)("project statuses", () => {
  const id = randomUUID()
  const scope = projectScope("member", "pm", {
    userId: id,
    organizationId: id,
    projectId: id,
    orgSlug: id,
    slug: "project"
  })
  let pool: Pool
  let layer: Layer.Layer<ProjectStatuses.ProjectStatuses>

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
      "INSERT INTO project_status (project_id,slug,label,icon,color,order_key,created_by) VALUES ($1,'todo','Todo','Circle','#a3a3a3','a0',$2), ($1,'in_review','In review','Eye','#e0a03b','a1',$2), ($1,'in_progress','In progress','CircleDot','#3b82f6','a2',$2), ($1,'done','Done','CircleCheck','#22c55e','a3',$2)",
      [id, id]
    )
    layer = ProjectStatuses.layer.pipe(
      Layer.provide(Layer.mock(TicketIndex.TicketIndex, {})),
      Layer.provide(Layer.mock(TicketRewrites.TicketRewrites, {})),
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
    effect: Effect.Effect<
      A,
      E,
      ProjectStatuses.ProjectStatuses | ProjectScope | ActivityActor
    >
  ) =>
    effect.pipe(
      Effect.provideService(ProjectScope, scope),
      Effect.provideService(ActivityActor, ActivityActor.user(id)),
      Effect.provide(layer)
    )

  it.effect("saves, keeps and clears a status description", () =>
    run(
      Effect.gen(function* () {
        const statuses = yield* ProjectStatuses.ProjectStatuses
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
    "lets a baseline status take a description and color but not a new label or icon",
    () =>
      run(
        Effect.gen(function* () {
          const statuses = yield* ProjectStatuses.ProjectStatuses
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

          const recolored = yield* statuses.update("todo", {
            color: StatusColor.make("#e0a03b")
          })
          expect(recolored).toMatchObject({ icon: "Circle", color: "#e0a03b" })

          const reiconed = yield* Effect.flip(
            statuses.update("todo", { icon: "Eye" })
          )
          expect(reiconed).toBeInstanceOf(Forbidden)
        })
      )
  )

  it.effect("creates a status at the end of the requested phase", () =>
    run(
      Effect.gen(function* () {
        const statuses = yield* ProjectStatuses.ProjectStatuses
        const review = yield* statuses.create({ label: label("Code review") })
        expect(review.orderKey > "a2" && review.orderKey < "a3").toBe(true)

        const wontDo = yield* statuses.create({
          label: label("Won't do"),
          phase: "finished"
        })
        expect(wontDo.orderKey > "a3").toBe(true)

        const refine = yield* statuses.create({
          label: label("Needs refinement"),
          phase: "unstarted"
        })
        expect(refine.orderKey > "a1" && refine.orderKey < "a2").toBe(true)
      })
    )
  )

  it.effect("refuses to move a built-in status past another one", () =>
    run(
      Effect.gen(function* () {
        const statuses = yield* ProjectStatuses.ProjectStatuses
        const error = yield* Effect.flip(
          statuses.reorder("done", { orderKey: OrderKey.make("a1V") })
        )
        expect(error).toEqual(new Conflict({ reason: "baseline_order" }))

        const moved = yield* statuses.reorder("todo", {
          orderKey: OrderKey.make("a1V")
        })
        expect(moved.orderKey).toBe("a1V")
      })
    )
  )

  const recordSpans = () => {
    const spans: Array<Tracer.NativeSpan> = []
    const tracer = Tracer.make({
      span: (options) => {
        const span = new Tracer.NativeSpan(options)
        spans.push(span)
        return span
      }
    })
    const roots = () =>
      spans.flatMap((span) => (Option.isNone(span.parent) ? [span.name] : []))
    return { tracer, roots }
  }

  it.effect("traces each call under its own ProjectStatuses span", () => {
    const { tracer, roots } = recordSpans()
    return run(
      Effect.gen(function* () {
        const statuses = yield* ProjectStatuses.ProjectStatuses
        yield* statuses.list()
        yield* Effect.flip(statuses.create({ label: label("Todo") }))
        yield* Effect.flip(statuses.update("missing", {}))
        yield* Effect.flip(
          statuses.reorder("missing", { orderKey: OrderKey.make("a0") })
        )
        yield* Effect.flip(statuses.remove("todo", {}))
      }).pipe(Effect.withTracer(tracer))
    ).pipe(
      Effect.map(() =>
        expect(roots()).toEqual([
          "ProjectStatuses.list",
          "ProjectStatuses.create",
          "ProjectStatuses.update",
          "ProjectStatuses.reorder",
          "ProjectStatuses.remove"
        ])
      )
    )
  })
})
