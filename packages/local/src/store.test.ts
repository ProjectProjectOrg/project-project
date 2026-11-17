import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import type { TicketFact } from "@pp/shared"
import { count, eq } from "drizzle-orm"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { expect } from "vitest"

import { LocalDb, localDbLayer } from "./LocalDb"
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
import { localTickets, localTicketTags } from "./tables"
import {
  changes,
  install,
  onePage,
  snapshot,
  ticket,
  direct,
  directly
} from "./testFacts"

const TestDatabase = localDbLayer.pipe(
  Layer.provideMerge(SqliteClient.layerMemory({}))
)

const at = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T11:00:00Z"))

const three = {
  ...ticket("T-3", "three"),
  estimate: { unit: "tshirt", value: "M" },
  tags: ["bug"],
  assignees: ["user-1"],
  parent: "T-1",
  relations: [{ to: "T-1", kind: "blocked_by" }],
  flag: { reason: "waiting", by: "user-1", at },
  git: {
    repoId: "repo-1",
    branch: "t-3",
    pr: 3,
    prState: "open",
    prDraft: false,
    prBase: null,
    lastTransitionedPr: null,
    branchDeletedAt: at,
    checks: "passing"
  },
  archivedAt: at
} satisfies TicketFact

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
        changes("1.4", [ticket("T-1", "renamed"), three], ["T-2"]),
        direct
      )

      const local = yield* readFacts("a/p")
      const server = snapshotFacts(
        snapshot("1.4", [ticket("T-1", "renamed"), three])
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
      yield* beginStaging(
        "a/p",
        {
          ...onePage("2.0", [ticket("T-1", "renamed")]),
          next: "page-2"
        },
        directly
      )
      expect(
        yield* applyPage(
          "a/p",
          "page-1",
          {
            ...onePage("2.0", [ticket("T-9", "wrong page")]),
            start: null
          },
          directly
        )
      ).toBe("stale")
      yield* applyPage(
        "a/p",
        "page-2",
        {
          ...onePage("2.0", [ticket("T-2", "two")]),
          start: null
        },
        directly
      )
      expect((yield* readFacts("a/p")).facts.tickets.map((t) => t.id)).toEqual([
        "T-1"
      ])

      const published = yield* publishStaging("a/p", directly)
      const local = yield* readFacts("a/p")
      expect(local.cursor).toBe("2.0")
      expect(local.facts.tickets.map((t) => t.data)).toEqual([
        expect.stringContaining("renamed"),
        expect.stringContaining("two")
      ])
      expect(published?.retired).not.toBeNull()
    }).pipe(Effect.provide(TestDatabase))
)

const numbered = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => {
    const n = String(from + index).padStart(4, "0")
    return ticket(`T-${n}`, `ticket ${n}`)
  })

const laterPage = (tickets: ReadonlyArray<TicketFact>) => ({
  ...onePage("2.0", tickets),
  start: null
})

const stagedTickets = Effect.gen(function* () {
  const db = yield* LocalDb
  const [row] = yield* db.select({ n: count() }).from(localTickets)
  return row?.n ?? 0
})

it.effect(
  "a page cut short by a restart resumes without the edges it wrote before",
  () =>
    Effect.gen(function* () {
      const tagged = (tag: string) => [
        { ...ticket("T-0001", "ticket 0001"), tags: [tag] },
        ...numbered(2, 600)
      ]
      yield* beginStaging(
        "a/p",
        { ...onePage("2.0", []), next: "page-2" },
        directly
      )
      let transactions = 0
      const crashing = {
        write: <A, E, R>(transaction: Effect.Effect<A, E, R>) =>
          Effect.suspend(() =>
            (transactions += 1) === 2 ? Effect.die("restart") : transaction
          ),
        readsWaiting: Effect.succeed(true)
      }
      const crashed = yield* Effect.exit(
        applyPage("a/p", "page-2", laterPage(tagged("old")), crashing)
      )

      yield* applyPage("a/p", "page-2", laterPage(tagged("new")), directly)
      yield* publishStaging("a/p", directly)

      const db = yield* LocalDb
      expect(Exit.isFailure(crashed)).toBe(true)
      expect(
        differences(
          yield* readFacts("a/p"),
          snapshotFacts(snapshot("2.0", tagged("new")))
        )
      ).toEqual([])
      expect(
        yield* db
          .select({ tag: localTicketTags.tag })
          .from(localTicketTags)
          .where(eq(localTicketTags.ticket, "T-0001"))
      ).toEqual([{ tag: "new" }])
    }).pipe(Effect.provide(TestDatabase))
)

it.effect("a page gives way to a waiting read between its slices", () =>
  Effect.gen(function* () {
    yield* beginStaging(
      "a/p",
      { ...onePage("2.0", []), next: "page-2" },
      directly
    )
    let waiting = true
    let transactions = 0
    const writer = {
      write: <A, E, R>(transaction: Effect.Effect<A, E, R>) =>
        Effect.suspend(() => {
          transactions += 1
          return transaction
        }),
      readsWaiting: Effect.sync(() => {
        const read = waiting
        waiting = false
        return read
      })
    }

    yield* applyPage("a/p", "page-2", laterPage(numbered(1, 600)), writer)

    expect(transactions).toBe(2)
    expect(yield* stagedTickets).toBe(600)
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
