import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import { CHILD_TICKET_SORT, EPIC_TYPE, TicketId } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { at } from "./sprintFacts"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"
import { localTicketList } from "./ticketList"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const epic = (id: string, title: string) => ({
  ...ticket(id, title),
  type: EPIC_TYPE
})

const listed = (query: Parameters<typeof localTicketList>[0]["query"]) =>
  Effect.gen(function* () {
    const rows = yield* localTicketList({
      copy: (yield* copyOf("a/p")) ?? -1,
      query,
      viewerId: "user-1",
      estimation: "off",
      repository: () => null
    })
    return rows?.map((row) => row.ticket.id)
  })

it.effect("the epic picker lists open epics by title", () =>
  Effect.gen(function* () {
    yield* install(
      "a/p",
      snapshot("1.1", [
        epic("T-1", "Zebra"),
        epic("T-2", "apple"),
        { ...epic("T-3", "Archived"), archivedAt: at("2026-11-10T00:00:00Z") },
        ticket("T-4", "Banana")
      ])
    )

    expect(
      yield* listed({
        type: [EPIC_TYPE],
        archived: false,
        sort: { key: "title", dir: "asc" }
      })
    ).toEqual(["T-2", "T-1"])
  }).pipe(Effect.provide(TestDatabase))
)

const child = (id: string, created: string) => ({
  ...ticket(id, id),
  parent: "T-1",
  createdAt: at(created)
})

it.effect("sub-tickets list a parent's unarchived children oldest first", () =>
  Effect.gen(function* () {
    yield* install(
      "a/p",
      snapshot("1.1", [
        ticket("T-1", "parent"),
        child("T-2", "2026-11-03T00:00:00Z"),
        child("T-3", "2026-11-02T00:00:00Z"),
        {
          ...child("T-4", "2026-11-01T00:00:00Z"),
          archivedAt: at("2026-11-10T00:00:00Z")
        },
        ticket("T-5", "other")
      ])
    )

    expect(
      yield* listed({ parent: [TicketId.make("T-1")], sort: CHILD_TICKET_SORT })
    ).toEqual(["T-3", "T-2"])
  }).pipe(Effect.provide(TestDatabase))
)
