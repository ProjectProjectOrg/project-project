import { expect, it } from "@effect/vitest"
import { Db } from "@pp/db"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"
import { ConnectionError, SqlError } from "effect/sql/SqlError"
import * as TestClock from "effect/testing/TestClock"

import { databaseLayer } from "../../test/database"
import * as TicketIndexServices from "./indexLayer"
import { makeTicketDocument } from "./testing"
import * as TicketDocs from "./TicketDocs"
import * as TicketIndex from "./TicketIndex"
import type { TicketProject } from "./ticketProject"

const project: TicketProject = {
  orgSlug: "acme",
  organizationId: "org-1",
  projectId: "project-1",
  slug: "foo"
}

const document = makeTicketDocument("T-1")

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
  docs: Layer.Layer<TicketDocs.TicketDocs> = Layer.mock(
    TicketDocs.TicketDocs,
    {}
  )
) => TicketIndexServices.layer.pipe(Layer.provide(db), Layer.provide(docs))

it.effect("retries a transient index publication failure", () => {
  const { layer, state } = makeDb(2)
  return Effect.gen(function* () {
    const index = yield* TicketIndex.TicketIndex
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
    const index = yield* TicketIndex.TicketIndex
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
  const docsLayer = Layer.mock(TicketDocs.TicketDocs, {
    listIds: () =>
      Effect.sync(() => {
        docs.listIdsCalls += 1
        return []
      })
  })

  return Effect.gen(function* () {
    const index = yield* TicketIndex.TicketIndex
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
