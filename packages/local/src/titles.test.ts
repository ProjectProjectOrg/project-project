import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import { at } from "./sprintFacts"
import { copyOf } from "./store"
import { install, snapshot, ticket } from "./testFacts"
import { localTitles } from "./titles"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

it.effect("titles leave archived tickets out", () =>
  Effect.gen(function* () {
    yield* install(
      "a/p",
      snapshot("1.1", [
        ticket("T-10", "ten"),
        ticket("T-2", "two"),
        { ...ticket("T-3", "three"), archivedAt: at("2026-11-10T00:00:00Z") }
      ])
    )

    expect(yield* localTitles((yield* copyOf("a/p")) ?? -1)).toEqual([
      { id: "T-2", title: "two" },
      { id: "T-10", title: "ten" }
    ])
  }).pipe(Effect.provide(TestDatabase))
)
