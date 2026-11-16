import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import { type ProjectSync, TicketListQuery, TicketStatus } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import { RpcTest } from "effect/rpc"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { expect } from "vitest"

import { localRpcsLayer } from "./handlers"
import { localDatabase } from "./LocalDb"
import { LocalRpcs } from "./LocalRpcs"
import { SyncSource } from "./SyncSource"
import { changes, snapshot, ticket } from "./testFacts"

const responses: Array<ProjectSync> = [
  snapshot("1.1", [ticket("T-1", "one")]),
  changes("1.2", [ticket("T-1", "renamed")], [])
]

const TestSource = Layer.succeed(SyncSource, {
  pull: () => Effect.sync(() => responses.shift() ?? changes("1.2", [], []))
})

const TestEngine = localRpcsLayer.pipe(
  Layer.provideMerge(TestSource),
  Layer.provideMerge(localDatabase(SqliteClient.makeMemory({})))
)

const project = { orgSlug: "a", slug: "p" }
const query = Schema.decodeUnknownSync(TicketListQuery)({})
const todo = TicketStatus.make("todo")

it.effect(
  "an open sections stream emits again after a pull changes a ticket",
  () =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LocalRpcs)
      expect(yield* client.Pull(project)).toEqual({
        kind: "ready",
        sync: "live"
      })
      const results = yield* Queue.unbounded<string>()
      yield* client
        .Sections({
          project,
          query,
          viewerId: undefined,
          estimation: "off",
          repositories: { fallback: null, byId: {} },
          limits: {},
          defaultLimit: 50
        })
        .pipe(
          Stream.runForEach((result) =>
            Queue.offer(
              results,
              result?.sections[todo]?.items[0]?.ticket.title ?? "none"
            )
          ),
          Effect.forkScoped
        )
      expect(yield* Queue.take(results)).toBe("one")
      yield* client.Pull(project)
      expect(yield* Queue.take(results)).toBe("renamed")
    }).pipe(Effect.scoped, Effect.provide(TestEngine))
)

const engineServing = (served: Array<ProjectSync>) =>
  localRpcsLayer.pipe(
    Layer.provideMerge(
      Layer.succeed(SyncSource, {
        pull: () => Effect.sync(() => served.shift() ?? changes("1.9", [], []))
      })
    ),
    Layer.provideMerge(localDatabase(SqliteClient.makeMemory({})))
  )

it.effect("a simulated offline pull answers offline without the server", () => {
  const served = [
    snapshot("1.1", [ticket("T-1", "one")]),
    changes("1.2", [], [])
  ]
  return Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LocalRpcs)
    yield* client.Pull(project)
    yield* client.SimulateOffline({ offline: true })
    expect(yield* client.Pull(project)).toEqual({
      kind: "ready",
      sync: "offline"
    })
    expect(served).toHaveLength(1)
  }).pipe(Effect.scoped, Effect.provide(engineServing(served)))
})

it.effect("diagnostics report the cursor and size of the last pull", () =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LocalRpcs)
    yield* client.Pull(project)
    yield* client.Pull(project)
    const [diagnostics] = yield* client
      .Diagnostics(project)
      .pipe(Stream.take(1), Stream.runCollect)
    expect(diagnostics).toMatchObject({
      cursor: "1.2",
      lastPull: { kind: "changes", facts: 2 },
      offline: false
    })
  }).pipe(
    Effect.scoped,
    Effect.provide(
      engineServing([
        snapshot("1.1", [ticket("T-1", "one")]),
        changes("1.2", [ticket("T-2", "two")], ["T-1"])
      ])
    )
  )
)
