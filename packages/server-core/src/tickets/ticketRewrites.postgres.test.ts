// @effect-diagnostics-next-line nodeBuiltinImport:off
import { randomUUID } from "node:crypto"

import { PgClient } from "@effect/sql-pg"
import { it } from "@effect/vitest"
import { DbLive, migrationsFolder } from "@pp/db"
import {
  ActivityActor,
  ProjectScope,
  StatusLabel,
  StatusSlug,
  TagName
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
import { ProjectStatuses } from "../projects/ProjectStatuses"
import { ProjectStatusesLive } from "../projects/ProjectStatusesLive"
import { Tags } from "../tags/Tags"
import { TagsLive } from "../tags/TagsLive"
import {
  makeFakeTicketDocs,
  makeFakeTicketIndex,
  makeTicketDocument,
  makeTicketsLayer,
  ticketStatus
} from "./testing"
import { TicketDocs, type TicketActivityOptions } from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"

const databaseUrl = process.env.PROJECTPROJECT_TEST_DATABASE_URL
const tagName = Schema.decodeSync(TagName)
const label = Schema.decodeSync(StatusLabel)
const statusSlug = Schema.decodeSync(StatusSlug)

describe.skipIf(!databaseUrl)("tag and status rewrites", () => {
  const id = randomUUID()
  const scope = projectScope("member", "pm", {
    userId: id,
    organizationId: id,
    projectId: id,
    orgSlug: id,
    slug: "project"
  })
  let pool: Pool

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
  })

  afterAll(async () => {
    if (!pool) return
    await pool.query("DELETE FROM organization WHERE id = $1", [id])
    await pool.query('DELETE FROM "user" WHERE id = $1', [id])
    await pool.end()
  })

  const resetProject = () =>
    Effect.promise(async () => {
      await pool.query("DELETE FROM project_status WHERE project_id = $1", [id])
      await pool.query("DELETE FROM project_tag WHERE project_id = $1", [id])
      await pool.query(
        "INSERT INTO project_status (project_id,slug,label,icon,color,order_key,created_by) VALUES ($1,'todo','Todo','Circle','#a3a3a3','a0',$2), ($1,'in_review','In review','Eye','#e0a03b','a1',$2), ($1,'in_progress','In progress','CircleDot','#3b82f6','a2',$2), ($1,'done','Done','CircleCheck','#22c55e','a3',$2)",
        [id, id]
      )
      await pool.query(
        "INSERT INTO project_tag (project_id,name,color,created_by) VALUES ($1,'core','#3b82f6',$2), ($1,'ui','#22c55e',$2)",
        [id, id]
      )
    })

  const fixture = () => {
    const docs = makeFakeTicketDocs([])
    const indexed = new Map(docs.documents)
    const before = makeTicketDocument("T-1")
    const put = (document: typeof before) => {
      docs.documents.set(document.id, document)
      indexed.set(document.id, document)
    }
    put(
      makeTicketDocument("T-1", {
        tags: [tagName("core"), tagName("ui")],
        status: ticketStatus("in_review")
      })
    )
    put(makeTicketDocument("T-2", { tags: [tagName("ui")] }))
    indexed.set(
      "T-9",
      makeTicketDocument("T-9", {
        tags: [tagName("core")],
        status: ticketStatus("in_review")
      })
    )
    const activity: Array<
      readonly [string, TicketActivityOptions | undefined]
    > = []
    const upserts: Array<string> = []
    const recordingDocs = Layer.succeed(TicketDocs, {
      ...docs.service,
      update: (org, slug, ticketId, transform, onPersist, options) =>
        docs.service
          .update(org, slug, ticketId, transform, onPersist, options)
          .pipe(
            Effect.tap(() =>
              Effect.sync(() => activity.push([ticketId, options]))
            )
          )
    })
    const index = makeFakeTicketIndex(indexed, {
      upsertTicket: (_project, document) =>
        Effect.sync(() => {
          indexed.set(document.id, document)
          upserts.push(document.id)
        })
    })
    const db = DbLive.pipe(
      Layer.provide(PgClient.layer({ url: Redacted.make(databaseUrl ?? "") }))
    )
    const layer = Layer.mergeAll(TagsLive, ProjectStatusesLive).pipe(
      Layer.provide(
        Layer.mergeAll(
          makeTicketsLayer("T", recordingDocs, { ticketIndex: index }),
          recordingDocs,
          index,
          TicketDocumentLock.layer,
          db
        )
      ),
      Layer.orDie
    )
    return { documents: docs.documents, activity, upserts, before, layer }
  }

  const run = <A, E>(
    layer: Layer.Layer<Tags | ProjectStatuses>,
    effect: Effect.Effect<
      A,
      E,
      Tags | ProjectStatuses | ProjectScope | ActivityActor
    >
  ) =>
    resetProject().pipe(
      Effect.andThen(effect),
      Effect.provideService(ProjectScope, scope),
      Effect.provideService(ActivityActor, ActivityActor.user(id)),
      Effect.provide(layer)
    )

  it.effect(
    "renaming a tag renames it on the tickets that have it, silently, and skips a ticket whose file is gone",
    () => {
      const { documents, activity, upserts, before, layer } = fixture()
      return run(
        layer,
        Effect.gen(function* () {
          const tags = yield* Tags
          yield* tags.update(tagName("core"), { name: tagName("platform") })

          expect(documents.get("T-1")?.tags).toEqual(["platform", "ui"])
          expect(documents.get("T-1")?.updatedAt).not.toEqual(before.updatedAt)
          expect(documents.get("T-2")?.tags).toEqual(["ui"])
          expect(documents.has("T-9")).toBe(false)
          expect(activity).toEqual([["T-1", { silent: true }]])
          expect(upserts).toEqual(["T-1"])
        })
      )
    }
  )

  it.effect(
    "removing a tag takes it off the tickets that have it and records why",
    () => {
      const { documents, activity, upserts, layer } = fixture()
      return run(
        layer,
        Effect.gen(function* () {
          const tags = yield* Tags
          yield* tags.remove(tagName("ui"))

          expect(documents.get("T-1")?.tags).toEqual(["core"])
          expect(documents.get("T-2")?.tags).toEqual([])
          expect(activity).toEqual([
            ["T-1", { cause: "tag_deleted" }],
            ["T-2", { cause: "tag_deleted" }]
          ])
          expect(upserts).toEqual(["T-1", "T-2"])
        })
      )
    }
  )

  it.effect(
    "renaming a status moves its tickets to the new slug silently and skips a ticket whose file is gone",
    () => {
      const { documents, activity, upserts, layer } = fixture()
      return run(
        layer,
        Effect.gen(function* () {
          const statuses = yield* ProjectStatuses
          yield* statuses.update(statusSlug("in_review"), {
            label: label("Needs review")
          })

          expect(documents.get("T-1")?.status).toBe("needs_review")
          expect(documents.get("T-2")?.status).toBe("todo")
          expect(documents.has("T-9")).toBe(false)
          expect(activity).toEqual([["T-1", { silent: true }]])
          expect(upserts).toEqual(["T-1"])
        })
      )
    }
  )

  it.effect(
    "removing a status moves its tickets to the chosen status and records why",
    () => {
      const { documents, activity, upserts, layer } = fixture()
      return run(
        layer,
        Effect.gen(function* () {
          const statuses = yield* ProjectStatuses
          yield* statuses.remove(statusSlug("in_review"), {
            reassignTo: statusSlug("done")
          })

          expect(documents.get("T-1")?.status).toBe("done")
          expect(activity).toEqual([["T-1", { cause: "status_removed" }]])
          expect(upserts).toEqual(["T-1"])
        })
      )
    }
  )
})
