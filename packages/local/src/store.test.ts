import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import {
  applySync,
  cursorOf,
  differences,
  purge,
  readFacts,
  snapshotFacts
} from "./store"
import { changes, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

it.effect(
  "a snapshot followed by changes holds the same facts as the snapshot at the new cursor",
  () =>
    Effect.gen(function* () {
      yield* applySync(
        "a/p",
        null,
        snapshot("1.2", [ticket("T-1", "one"), ticket("T-2", "two")])
      )
      yield* applySync(
        "a/p",
        "1.2",
        changes(
          "1.4",
          [ticket("T-1", "renamed"), ticket("T-3", "three")],
          ["T-2"]
        )
      )

      const local = yield* readFacts("a/p")
      const server = snapshotFacts(
        snapshot("1.4", [ticket("T-1", "renamed"), ticket("T-3", "three")])
      )
      expect(local.cursor).toBe("1.4")
      expect(differences(local, server)).toEqual([])
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "refuses a response pulled from an older cursor and changes nothing",
  () =>
    Effect.gen(function* () {
      yield* applySync("a/p", null, snapshot("1.2", [ticket("T-1", "one")]))
      yield* applySync(
        "a/p",
        "1.2",
        changes("1.3", [ticket("T-1", "newer")], [])
      )

      const result = yield* applySync(
        "a/p",
        "1.2",
        changes("1.3", [ticket("T-1", "older")], [])
      )

      expect(result).toBe("stale")
      expect(yield* cursorOf("a/p")).toBe("1.3")
      expect((yield* readFacts("a/p")).facts.tickets[0]?.data).toContain(
        "newer"
      )
    }).pipe(Effect.provide(TestDatabase))
)

it.effect("purging a project leaves other projects alone", () =>
  Effect.gen(function* () {
    yield* applySync("a/p", null, snapshot("1.1", [ticket("T-1", "one")]))
    yield* applySync("a/q", null, snapshot("1.1", [ticket("Q-1", "one")]))

    yield* purge("a/p")

    expect(yield* readFacts("a/p")).toMatchObject({
      cursor: null,
      project: null,
      facts: { tickets: [], tags: [] }
    })
    expect((yield* readFacts("a/q")).facts.tickets).toHaveLength(1)
  }).pipe(Effect.provide(TestDatabase))
)

it.effect("reports facts that differ from the server", () =>
  Effect.gen(function* () {
    yield* applySync("a/p", null, snapshot("1.1", [ticket("T-1", "one")]))

    const server = snapshotFacts(
      snapshot("1.1", [ticket("T-1", "changed"), ticket("T-2", "two")])
    )

    expect(differences(yield* readFacts("a/p"), server)).toEqual([
      "tickets/T-1",
      "tickets/T-2"
    ])
  }).pipe(Effect.provide(TestDatabase))
)
