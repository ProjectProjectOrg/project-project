import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type StatusFact,
  type TicketFact,
  TicketListQuery,
  TicketListSource
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { localSequence } from "./sequence"
import { at, sprintFact } from "./sprintFacts"
import { localSprintSections } from "./sprints"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const now = at("2026-11-16T12:00:00Z")

const status = (slug: string, orderKey: string): StatusFact => ({
  slug,
  label: slug,
  icon: "circle",
  color: "#777777",
  orderKey,
  description: null
})

const decodeSource = Schema.decodeUnknownEffect(TicketListSource)
const decodeQuery = Schema.decodeEffect(TicketListQuery)

const sequenceOf = (
  id: string,
  from: typeof TicketListSource.Encoded | undefined
) =>
  Effect.gen(function* () {
    const result = yield* localSequence({
      copy: (yield* copyOf("a/p")) ?? -1,
      id,
      from: from === undefined ? undefined : yield* decodeSource(from),
      viewerId: "user-1",
      estimation: "off",
      now
    })
    return result?.sequence === null
      ? null
      : {
          within: result?.sequence.within,
          ids: result?.sequence.tickets.map((ticket) => ticket.id)
        }
  })

const ranked = (id: string, rank: string): TicketFact => ({
  ...ticket(id, id),
  rank
})

it.effect(
  "the sprint grouping steps through planned sprints, unscheduled, then active and completed sprints",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          ranked("T-1", "a"),
          ranked("T-2", "b"),
          ranked("T-3", "c"),
          ranked("T-4", "d"),
          ranked("T-5", "e")
        ]),
        groups: [
          sprintFact("G-1", ["T-2", "T-3"]),
          sprintFact("G-2", ["T-3", "T-1"], {
            completedAt: at("2026-11-10T00:00:00Z")
          }),
          sprintFact("G-3", ["T-5"], { startsAt: at("2026-12-01T00:00:00Z") })
        ]
      })

      expect(
        yield* sequenceOf("T-4", {
          kind: "sections",
          grouping: "sprint",
          query: {}
        })
      ).toEqual({ within: "view", ids: ["T-5", "T-4", "T-2", "T-3", "T-1"] })
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a sprint board steps by status then rank and skips sub-tickets under a ticket on the board",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          { ...ranked("T-1", "c"), status: "done" },
          ranked("T-2", "b"),
          { ...ranked("T-3", "a"), parent: "T-2" },
          { ...ranked("T-4", "d"), parent: "T-9" },
          ranked("T-5", "e")
        ]),
        statuses: [status("todo", "a"), status("done", "b")],
        groups: [sprintFact("G-1", ["T-1", "T-2", "T-3", "T-4"])]
      })

      expect(
        yield* sequenceOf("T-2", {
          kind: "sprintBoard",
          groupId: "G-1",
          query: {}
        })
      ).toEqual({ within: "view", ids: ["T-2", "T-4", "T-1"] })
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a ticket outside the view steps through its parent's sub-tickets",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          ticket("T-1", "parent"),
          {
            ...ticket("T-2", "two"),
            parent: "T-1",
            createdAt: at("2026-11-03T00:00:00Z")
          },
          {
            ...ticket("T-3", "three"),
            parent: "T-1",
            status: "done",
            createdAt: at("2026-11-02T00:00:00Z")
          }
        ])
      })

      expect(
        yield* sequenceOf("T-3", {
          kind: "sections",
          grouping: "status",
          query: { status: ["todo"] }
        })
      ).toEqual({ within: "parent", ids: ["T-3", "T-2"] })
      expect(yield* sequenceOf("T-1", undefined)).toBeNull()
    }).pipe(Effect.provide(TestDatabase))
)

const viewOrder = (query: typeof TicketListQuery.Encoded) =>
  Effect.gen(function* () {
    const result = yield* localSprintSections({
      copy: (yield* copyOf("a/p")) ?? -1,
      query: yield* decodeQuery(query),
      viewerId: "user-1",
      estimation: "off",
      repository: () => null,
      pages: {},
      pageSize: 50,
      now
    })
    return result?.sections.flatMap((section) =>
      section.page.items.map((item) => item.ticket.id)
    )
  })

it.effect(
  "the sprint grouping steps in the view's order when sprints share a ticket",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          ranked("T-1", "a"),
          ranked("T-2", "z"),
          ranked("T-3", "b"),
          ranked("T-4", "c")
        ]),
        groups: [
          sprintFact("G-1", ["T-1", "T-2"]),
          sprintFact("G-2", ["T-2", "T-3"], {
            createdAt: at("2026-11-05T00:00:00Z")
          })
        ]
      })

      for (const [query, ids] of [
        [{}, ["T-4", "T-1", "T-3", "T-2"]],
        [{ groupId: ["G-1", "G-2"] }, ["T-1", "T-3", "T-2"]]
      ] as const) {
        expect(yield* viewOrder(query)).toEqual(ids)
        expect(
          yield* sequenceOf("T-1", {
            kind: "sections",
            grouping: "sprint",
            query
          })
        ).toEqual({ within: "view", ids })
      }
    }).pipe(Effect.provide(TestDatabase))
)
