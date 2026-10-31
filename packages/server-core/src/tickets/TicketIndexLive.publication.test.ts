import { expect, it } from "@effect/vitest"
import { Db } from "@pp/db"
import { TicketStatus } from "@pp/shared"
import { TicketId } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "effect/sql/SqlClient"
import { ConnectionError, SqlError } from "effect/sql/SqlError"
import * as TestClock from "effect/testing/TestClock"

import { databaseLayer } from "../../test/database"
import * as TicketIndexServices from "./indexLayer"
import { TicketDocs } from "./TicketDocs"
import type { TicketDocument } from "./TicketDocs"
import { TicketIndex } from "./TicketIndex"
import type { TicketProject } from "./ticketProject"

const ticketId = Schema.decodeUnknownSync(TicketId)

const project: TicketProject = {
  orgSlug: "acme",
  organizationId: "org-1",
  projectId: "project-1",
  slug: "foo"
}

const document: TicketDocument = {
  id: ticketId("T-1"),
  title: "Publish me",
  status: TicketStatus.make("todo"),
  type: "chore",
  priority: "med",
  tags: [],
  branch: null,
  pr: null,
  prState: null,
  lastTransitionedPr: null,
  assignees: [],
  archivedAt: null,
  createdBy: "user-1",
  createdAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  updatedBy: "user-1",
  updatedAt: DateTime.toDate(DateTime.makeUnsafe("2026-01-01T00:00:00.000Z")),
  body: "# Publish me\n",
  commentsRegion: ""
}

const makeDb = (failures: number) => {
  const state = { attempts: 0 }
  const layer = databaseLayer(({ sql }) =>
    Effect.suspend(() => {
      if (!sql.startsWith('insert into "ticket_index"'))
        return Effect.succeed([])
      state.attempts += 1
      return state.attempts <= failures
        ? Effect.fail(
            new SqlError({
              reason: new ConnectionError({
                cause: "connection reset",
                message: "connection reset"
              })
            })
          )
        : Effect.succeed([])
    })
  )
  return { layer, state }
}

const layerFor = (
  db: Layer.Layer<Db | SqlClient.SqlClient>,
  docs: Layer.Layer<TicketDocs> = Layer.mock(TicketDocs, {})
) => TicketIndexServices.layer.pipe(Layer.provide(db), Layer.provide(docs))

it.effect("retries a transient index publication failure", () => {
  const { layer, state } = makeDb(2)
  return Effect.gen(function* () {
    const index = yield* TicketIndex
    const publishing = yield* Effect.forkChild(
      index.upsertTicket(project, document)
    )
    yield* TestClock.adjust("1 second")
    yield* Fiber.join(publishing)
    expect(state.attempts).toBe(3)
  }).pipe(Effect.provide(layerFor(layer)))
})

it.effect("does not fail the request when publication stays broken", () => {
  const { layer, state } = makeDb(Number.POSITIVE_INFINITY)
  return Effect.gen(function* () {
    const index = yield* TicketIndex
    const publishing = yield* Effect.forkChild(
      index.upsertTicket(project, document).pipe(Effect.exit)
    )
    yield* TestClock.adjust("2 seconds")
    const exit = yield* Fiber.join(publishing)
    expect(exit._tag).toBe("Success")
    expect(state.attempts).toBe(6)
  }).pipe(Effect.provide(layerFor(layer)))
})

it.effect("reconciles a project whose publication never landed", () => {
  const { layer } = makeDb(Number.POSITIVE_INFINITY)
  const docs = { listIdsCalls: 0 }
  const docsLayer = Layer.mock(TicketDocs, {
    listIds: () =>
      Effect.sync(() => {
        docs.listIdsCalls += 1
        return []
      })
  })

  return Effect.gen(function* () {
    const index = yield* TicketIndex
    const publishing = yield* Effect.forkChild(
      index.upsertTicket(project, document)
    )
    yield* TestClock.adjust("2 seconds")
    yield* Fiber.join(publishing)
    expect(docs.listIdsCalls).toBe(0)

    yield* TestClock.adjust("6 seconds")
    expect(docs.listIdsCalls).toBeGreaterThan(0)
  }).pipe(Effect.provide(layerFor(layer, docsLayer)))
})
