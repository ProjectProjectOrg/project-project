import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localDbLayer } from "./LocalDb"
import {
  applyChanges,
  applyPage,
  beginStaging,
  cursorOf,
  differences,
  dropCopyBatch,
  forget,
  publishStaging,
  readFacts,
  snapshotFacts
} from "./store"
import { changes, install, onePage, snapshot, ticket } from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const direct = <A, E, R>(transaction: Effect.Effect<A, E, R>) => transaction

const dropAll = (copy: number) =>
  dropCopyBatch(copy).pipe(Effect.repeat({ until: (dropped) => dropped }))

it.effect(
  "a snapshot followed by changes holds the same facts as the snapshot at the new cursor",
  () =>
    Effect.gen(function* () {
      yield* install(
        "a/p",
        snapshot("1.2", [ticket("T-1", "one"), ticket("T-2", "two")])
      )
      yield* applyChanges(
        "a/p",
        "1.2",
        changes(
          "1.4",
          [ticket("T-1", "renamed"), ticket("T-3", "three")],
          ["T-2"]
        ),
        direct
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
      yield* install("a/p", snapshot("1.2", [ticket("T-1", "one")]))
      yield* applyChanges(
        "a/p",
        "1.2",
        changes("1.3", [ticket("T-1", "newer")], []),
        direct
      )

      const result = yield* applyChanges(
        "a/p",
        "1.2",
        changes("1.3", [ticket("T-1", "older")], []),
        direct
      )

      expect(result).toBe("stale")
      expect(yield* cursorOf("a/p")).toBe("1.3")
      expect((yield* readFacts("a/p")).facts.tickets[0]?.data).toContain(
        "newer"
      )
    }).pipe(Effect.provide(TestDatabase))
)

it.effect(
  "keeps the published copy readable until its replacement has every page",
  () =>
    Effect.gen(function* () {
      yield* install("a/p", snapshot("1.2", [ticket("T-1", "one")]))
      yield* beginStaging("a/p", {
        ...onePage("2.0", [ticket("T-1", "renamed")]),
        next: "page-2"
      })
      expect(
        yield* applyPage("a/p", "page-1", {
          ...onePage("2.0", [ticket("T-9", "wrong page")]),
          start: null
        })
      ).toBe("stale")
      yield* applyPage("a/p", "page-2", {
        ...onePage("2.0", [ticket("T-2", "two")]),
        start: null
      })
      expect((yield* readFacts("a/p")).facts.tickets.map((t) => t.id)).toEqual([
        "T-1"
      ])

      const published = yield* publishStaging("a/p")
      const local = yield* readFacts("a/p")
      expect(local.cursor).toBe("2.0")
      expect(local.facts.tickets.map((t) => t.data)).toEqual([
        expect.stringContaining("renamed"),
        expect.stringContaining("two")
      ])
      expect(published?.retired).not.toBeNull()
    }).pipe(Effect.provide(TestDatabase))
)

it.effect("forgetting a project leaves other projects alone", () =>
  Effect.gen(function* () {
    yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))
    yield* install("a/q", snapshot("1.1", [ticket("Q-1", "one")]))

    for (const copy of yield* forget("a/p")) yield* dropAll(copy)

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
    yield* install("a/p", snapshot("1.1", [ticket("T-1", "one")]))

    const server = snapshotFacts(
      snapshot("1.1", [ticket("T-1", "changed"), ticket("T-2", "two")])
    )

    expect(differences(yield* readFacts("a/p"), server)).toEqual([
      "tickets/T-1",
      "tickets/T-2"
    ])
  }).pipe(Effect.provide(TestDatabase))
)
