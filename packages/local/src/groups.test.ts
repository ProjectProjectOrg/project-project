import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localGroupList } from "./groups"
import { localDbLayer } from "./LocalDb"
import { at, sprintFact } from "./sprintFacts"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

it.effect(
  "groups list newest first with their tickets in membership order",
  () =>
    Effect.gen(function* () {
      const completedAt = at("2026-11-10T00:00:00Z")
      yield* install("a/p", {
        ...snapshot("1.1", [ticket("T-1", "one"), ticket("T-2", "two")]),
        groups: [
          sprintFact("G-1", ["T-2", "T-1"], {
            createdAt: at("2026-10-01T00:00:00Z"),
            completedAt
          }),
          sprintFact("G-2", [], { createdAt: at("2026-11-01T00:00:00Z") })
        ]
      })

      const groups = yield* localGroupList((yield* copyOf("a/p")) ?? -1)

      expect(
        groups.map((group) => ({
          id: group.id,
          tickets: group.tickets,
          completedAt: group.completedAt
        }))
      ).toEqual([
        { id: "G-2", tickets: [], completedAt: null },
        { id: "G-1", tickets: ["T-2", "T-1"], completedAt }
      ])
    }).pipe(Effect.provide(TestDatabase))
)
