import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import { EPIC_TYPE, TicketListQuery } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { localParentSections, type ParentGrouping } from "./parents"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const decodeQuery = Schema.decodeEffect(TicketListQuery)
const now = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T12:00:00Z"))

const sectionsBy = (by: ParentGrouping) =>
  Effect.gen(function* () {
    const result = yield* localParentSections({
      copy: (yield* copyOf("a/p")) ?? -1,
      by,
      query: yield* decodeQuery({}),
      viewerId: "user-1",
      estimation: "off",
      repository: () => null,
      pages: {},
      pageSize: 50
    })
    return result.sections.map((section) => ({
      key: section.key,
      count: section.count,
      ids: section.page.items.map((item) => item.ticket.id)
    }))
  })

it.effect(
  "groups tickets under their epic or parent the way the server does",
  () =>
    Effect.gen(function* () {
      yield* install(
        "a/p",
        snapshot("1.1", [
          { ...ticket("T-10", "Alpha"), type: EPIC_TYPE },
          { ...ticket("T-11", "Beta"), type: EPIC_TYPE, archivedAt: now },
          { ...ticket("T-20", "Story"), parent: "T-10" },
          { ...ticket("T-21", "Sub-ticket"), parent: "T-20" },
          { ...ticket("T-1", "Under the epic"), parent: "T-10" },
          ticket("T-2", "On its own")
        ])
      )

      expect(yield* sectionsBy("epic")).toEqual([
        { key: "T-10", count: 3, ids: ["T-1", "T-20", "T-21"] },
        { key: "none", count: 1, ids: ["T-2"] }
      ])
      expect(yield* sectionsBy("parent")).toEqual([
        { key: "T-20", count: 1, ids: ["T-21"] },
        { key: "none", count: 3, ids: ["T-1", "T-2", "T-20"] }
      ])
    }).pipe(Effect.provide(TestDatabase))
)
