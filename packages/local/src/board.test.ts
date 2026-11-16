import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localSprintBoard } from "./board"
import { localDbLayer } from "./LocalDb"
import { at, sprintFact } from "./sprintFacts"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

it.effect(
  "a completed sprint's board lists its unarchived tickets by rank",
  () =>
    Effect.gen(function* () {
      const completedAt = at("2026-11-10T00:00:00Z")
      yield* install("a/p", {
        ...snapshot("1.1", [
          { ...ticket("T-1", "one"), rank: "b" },
          { ...ticket("T-2", "two"), rank: "a" },
          { ...ticket("T-3", "three"), archivedAt: completedAt },
          ticket("T-4", "four")
        ]),
        groups: [sprintFact("G-1", ["T-1", "T-2", "T-3"], { completedAt })]
      })
      const copy = (yield* copyOf("a/p")) ?? -1
      const board = (groupId: string) =>
        localSprintBoard({ copy, groupId, repository: () => null })

      const completed = yield* board("G-1")
      expect({
        ids: completed?.tickets.map((ticket) => ticket.id),
        completedAt: completed?.completedAt
      }).toEqual({ ids: ["T-2", "T-1"], completedAt })
      expect(yield* board("G-9")).toBeNull()
    }).pipe(Effect.provide(TestDatabase))
)
