import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import * as SqliteMigrator from "@effect/sql-sqlite-wasm/SqliteMigrator"
import { it } from "@effect/vitest"
import type { ProjectSync, TicketFact } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { localDbLayer } from "./localDatabase"
import { localMigrations } from "./localSchema"
import {
  applySync,
  cursorOf,
  differences,
  purge,
  readFacts,
  snapshotFacts
} from "./localStore"

const TestDatabase = Layer.mergeAll(
  SqliteMigrator.layer({ loader: localMigrations }),
  localDbLayer
).pipe(Layer.provideMerge(SqliteClient.layerMemory({})))

const at = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T10:00:00Z"))

const ticket = (id: string, title: string): TicketFact => ({
  id,
  title,
  status: "todo",
  type: null,
  priority: "med",
  rank: id,
  estimate: null,
  tags: [],
  assignees: [],
  parent: null,
  relations: [],
  flag: null,
  git: null,
  archivedAt: null,
  createdBy: "user-1",
  createdAt: at,
  updatedAt: at
})

const project = {
  id: "project-1",
  key: "T",
  name: "Test",
  icon: "folder",
  color: "blue",
  estimation: "off"
} as const

const snapshot = (
  cursor: string,
  tickets: ReadonlyArray<TicketFact>
): Extract<ProjectSync, { kind: "snapshot" }> => ({
  kind: "snapshot",
  cursor,
  project,
  tickets,
  groups: [],
  statuses: [],
  tags: [{ name: "bug", color: "red" }],
  members: []
})

const changes = (
  cursor: string,
  upserts: ReadonlyArray<TicketFact>,
  deletes: ReadonlyArray<string>
): Extract<ProjectSync, { kind: "changes" }> => ({
  kind: "changes",
  cursor,
  project: null,
  upserts: {
    tickets: upserts,
    groups: [],
    statuses: [],
    tags: [],
    members: []
  },
  deletes: {
    tickets: deletes,
    groups: [],
    statuses: [],
    tags: [],
    members: []
  },
  comments: []
})

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
