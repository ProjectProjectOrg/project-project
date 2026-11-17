import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import { type GroupFact, TicketListQuery } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { localSprintSections } from "./sprints"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const at = (iso: string) => DateTime.toDateUtc(DateTime.makeUnsafe(iso))
const now = at("2026-11-16T12:00:00Z")

const sprint = (
  id: string,
  tickets: ReadonlyArray<string>,
  completedAt: Date | null
): GroupFact => ({
  id,
  kind: "sprint",
  name: id,
  color: "blue",
  startsAt: at("2026-11-01T00:00:00Z"),
  endsAt: null,
  completedAt,
  tickets,
  createdBy: "user-1",
  createdAt: at("2026-11-01T00:00:00Z"),
  updatedAt: at("2026-11-01T00:00:00Z")
})

const decodeQuery = Schema.decodeEffect(TicketListQuery)

const sectionsFor = (query: typeof TicketListQuery.Encoded) =>
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
    return result?.sections.map((section) => ({
      key: section.key,
      count: section.count,
      ids: section.page.items.map((item) => item.ticket.id)
    }))
  })

it.effect(
  "open sprints claim shared tickets before completed ones and the rest is unscheduled",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          ticket("T-1", "one"),
          ticket("T-2", "two"),
          ticket("T-3", "three"),
          { ...ticket("T-4", "four"), status: "done" },
          ticket("T-5", "five")
        ]),
        groups: [
          sprint("G-1", ["T-1", "T-2"], null),
          sprint("G-2", ["T-2", "T-3"], at("2026-11-10T00:00:00Z"))
        ]
      })

      expect(yield* sectionsFor({})).toEqual([
        { key: "unscheduled", count: 2, ids: ["T-4", "T-5"] },
        { key: "G-1", count: 2, ids: ["T-1", "T-2"] },
        { key: "G-2", count: 1, ids: ["T-3"] }
      ])
      expect(yield* sectionsFor({ status: ["todo"] })).toEqual([
        { key: "unscheduled", count: 1, ids: ["T-5"] },
        { key: "G-1", count: 2, ids: ["T-1", "T-2"] },
        { key: "G-2", count: 1, ids: ["T-3"] }
      ])
      expect(yield* sectionsFor({ groupId: ["ungrouped"] })).toEqual([
        { key: "unscheduled", count: 3, ids: ["T-3", "T-4", "T-5"] }
      ])
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a ticket in two open sprints belongs to the newest, and ties go to the lower id",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [ticket("T-1", "one"), ticket("T-2", "two")]),
        groups: [
          sprint("G-10", ["T-1", "T-2"], null),
          sprint("G-9", ["T-2"], null),
          {
            ...sprint("G-11", ["T-1"], null),
            createdAt: at("2026-11-05T00:00:00Z")
          }
        ]
      })

      expect(yield* sectionsFor({})).toEqual([
        { key: "unscheduled", count: 0, ids: [] },
        { key: "G-10", count: 0, ids: [] },
        { key: "G-11", count: 1, ids: ["T-1"] },
        { key: "G-9", count: 1, ids: ["T-2"] }
      ])
    }).pipe(Effect.provide(TestDatabase))
)

it.effect("a section past the row budget gets its rows once asked for", () =>
  Effect.gen(function* () {
    const backlog = Array.from({ length: 500 }, (_, index) =>
      ticket(`T-${index + 1}`, "backlog")
    )
    yield* install("a/p", {
      ...snapshot("1.1", [...backlog, ticket("T-501", "sprint")]),
      groups: [sprint("G-1", ["T-501"], null)]
    })
    const sprintSection = (pages: Readonly<Record<string, number>>) =>
      Effect.gen(function* () {
        const result = yield* localSprintSections({
          copy: (yield* copyOf("a/p")) ?? -1,
          query: yield* decodeQuery({}),
          viewerId: "user-1",
          estimation: "off",
          repository: () => null,
          pages,
          pageSize: 500,
          now
        })
        const section = result?.sections.find(({ key }) => key === "G-1")
        return {
          ids: section?.page.items.map((item) => item.ticket.id),
          nextCursor: section?.page.nextCursor
        }
      })

    expect(yield* sprintSection({})).toEqual({ ids: [], nextCursor: "local:0" })
    expect(yield* sprintSection({ "G-1": 0 })).toEqual({
      ids: ["T-501"],
      nextCursor: null
    })
  }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "a nested sub-ticket stays listed when its parent is in another sprint section",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", {
        ...snapshot("1.1", [
          ticket("T-1", "parent"),
          { ...ticket("T-2", "same sprint"), parent: "T-1" },
          { ...ticket("T-3", "unscheduled"), parent: "T-1" }
        ]),
        groups: [sprint("G-1", ["T-1", "T-2"], null)]
      })
      const expected = [
        { key: "unscheduled", count: 1, ids: ["T-3"] },
        { key: "G-1", count: 1, ids: ["T-1"] }
      ]

      expect(yield* sectionsFor({ subTickets: "nested" })).toEqual(expected)
      expect(
        yield* sectionsFor({
          subTickets: "nested",
          groupId: ["G-1", "ungrouped"]
        })
      ).toEqual(expected)
    }).pipe(Effect.provide(TestDatabase))
)
