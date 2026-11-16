import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type ProjectSync,
  type ProjectSyncQuery,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import { RpcTest } from "effect/rpc"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { expect } from "vitest"

import { localRpcsLayer } from "./handlers"
import { quietInbox } from "./inboxFacts"
import { localDatabase } from "./LocalDb"
import { type LocalProject, LocalRpcs } from "./LocalRpcs"
import { SyncOffline, SyncSource } from "./SyncSource"
import { changes, onePage, ticket } from "./testFacts"

const responses: Array<ProjectSync> = [
  onePage("1.1", [ticket("T-1", "one")]),
  changes("1.1", [], []),
  changes("1.2", [ticket("T-1", "renamed")], [])
]

const engineWith = (pull: SyncSource["Service"]["pull"]) =>
  localRpcsLayer.pipe(
    Layer.provideMerge(Layer.succeed(SyncSource, { pull })),
    Layer.provideMerge(quietInbox),
    Layer.provideMerge(localDatabase(SqliteClient.makeMemory({})))
  )

const TestEngine = engineWith(() =>
  Effect.sync(() => responses.shift() ?? changes("1.2", [], []))
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
          pages: {},
          pageSize: 50
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

it.effect("an interrupted snapshot resumes from its next page", () => {
  const asked: Array<ProjectSyncQuery> = []
  let interrupted = false
  const pull = (_: LocalProject, request: ProjectSyncQuery) =>
    Effect.suspend(() => {
      asked.push(request)
      if (request.page === "page-2" && !interrupted) {
        interrupted = true
        return Effect.fail(new SyncOffline())
      }
      if (request.page === "page-2")
        return Effect.succeed<ProjectSync>({
          ...onePage("1.1", [ticket("T-2", "two")]),
          start: null
        })
      if (request.after !== undefined)
        return Effect.succeed<ProjectSync>(changes("1.1", [], []))
      return Effect.succeed<ProjectSync>({
        ...onePage("1.1", [ticket("T-1", "one")]),
        next: "page-2"
      })
    })
  return Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LocalRpcs)
    expect(yield* client.Pull(project)).toEqual({ kind: "failed" })
    expect(yield* client.Pull(project)).toEqual({ kind: "ready", sync: "live" })
    expect(asked).toEqual([
      {},
      { page: "page-2" },
      { page: "page-2" },
      { after: "1.1" }
    ])
  }).pipe(Effect.scoped, Effect.provide(engineWith(pull)))
})
