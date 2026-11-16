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
