import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import { type PrivateSync, TicketId } from "@pp/shared"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import { RpcTest } from "effect/rpc"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import { expect } from "vitest"

import { localRpcsLayer } from "./handlers"
import {
  inboxEngine,
  inboxFact,
  privateChanges,
  privateSnapshot
} from "./inboxFacts"
import { InboxRejected, type InboxSource } from "./inboxSource"
import { localDatabase } from "./LocalDb"
import { LocalRpcs } from "./LocalRpcs"
import { SyncSource } from "./SyncSource"

const ticketId = Schema.decodeUnknownSync(TicketId)

const engine = (source: InboxSource["Service"]) =>
  localRpcsLayer.pipe(
    Layer.provideMerge(
      Layer.succeed(SyncSource, {
        pull: () => Effect.die(new Error("no project scope in this test"))
      })
    ),
    Layer.provideMerge(inboxEngine(source)),
    Layer.provideMerge(localDatabase(SqliteClient.makeMemory({})))
  )

const replies = (responses: Array<PrivateSync>) => () =>
  Effect.sync(() => responses.shift() ?? privateChanges("1.9", [], []))

const readSince = "2026-11-16T10:30:00Z"

const listed = Effect.gen(function* () {
  const client = yield* RpcTest.makeClient(LocalRpcs)
  const seen = yield* Queue.unbounded<ReadonlyArray<string> | null>()
  yield* client.Inbox({ orgSlug: "acme", readSince }).pipe(
    Stream.runForEach((items) =>
      Queue.offer(seen, items?.map((item) => item.ticket.id) ?? null)
    ),
    Effect.forkScoped
  )
  return { client, seen }
})

const markDone = {
  kind: "done",
  orgSlug: "acme",
  projectSlug: "app",
  ticketId: ticketId("T-1")
} as const

it.live(
  "lists one org's unread rows and rows with open reasons, newest first, and counts its unread",
  () =>
    Effect.gen(function* () {
      const { client, seen } = yield* listed
      expect(yield* Queue.take(seen)).toBe(null)
      yield* client.InboxPull()
      expect(yield* Queue.take(seen)).toEqual(["T-3", "T-1"])
      expect(
        yield* client.InboxUnread({ orgSlug: "acme" }).pipe(
          Stream.runHead,
          Effect.map((head) => head.valueOrUndefined)
        )
      ).toBe(2)
    }).pipe(
      Effect.scoped,
      Effect.provide(
        engine({
          pull: replies([
            privateSnapshot("1.1", [
              inboxFact("T-1", 1, "unread"),
              inboxFact("T-2", 2, "read"),
              inboxFact("T-3", 3, "unread"),
              inboxFact("T-4", 4, "done"),
              inboxFact("T-5", 5, "unread", "other")
            ])
          ]),
          mark: () => Effect.succeed(null)
        })
      )
    )
)

it.live(
  "a row marked done stays hidden until the copy reaches the receipt, whatever re-reads it meanwhile",
  () => {
    const caughtUp = Deferred.makeUnsafe<void>()
    const responses = replies([
      privateSnapshot("1.1", [
        inboxFact("T-1", 1, "unread"),
        inboxFact("T-2", 2, "unread")
      ]),
      privateChanges("1.1", []),
      privateChanges("1.2", [inboxFact("T-1", 1, "done")])
    ])
    let pulls = 0
    return Effect.gen(function* () {
      const { client, seen } = yield* listed
      yield* client.InboxPull()
      yield* Queue.take(seen)
      expect(yield* Queue.take(seen)).toEqual(["T-2", "T-1"])
      yield* client.InboxMark(markDone).pipe(Effect.forkScoped)
      expect(yield* Queue.take(seen)).toEqual(["T-2"])
      yield* client
        .InboxMark({ ...markDone, kind: "read", ticketId: ticketId("T-2") })
        .pipe(Effect.forkScoped)
      yield* Effect.sleep("50 millis")
      yield* Deferred.succeed(caughtUp, undefined)
      yield* Effect.sleep("50 millis")
      const rest = yield* Queue.clear(seen)
      expect(rest.length).toBeGreaterThan(0)
      expect(rest.every((ids) => ids?.includes("T-1") === false)).toBe(true)
    }).pipe(
      Effect.scoped,
      Effect.provide(
        engine({
          pull: () =>
            Effect.suspend(() => {
              pulls += 1
              return pulls === 3
                ? Deferred.await(caughtUp).pipe(Effect.andThen(responses()))
                : responses()
            }),
          mark: (_id, mark) =>
            Effect.succeed(
              mark.kind === "done" ? { generation: 1, sequence: 2 } : null
            )
        })
      )
    )
  }
)

it.live("a rejected mark puts the row back", () =>
  Effect.gen(function* () {
    const { client, seen } = yield* listed
    yield* client.InboxPull()
    yield* Queue.take(seen)
    yield* Queue.take(seen)
    yield* client.InboxMark(markDone)
    expect(yield* Queue.take(seen)).toEqual([])
    expect(yield* Queue.take(seen)).toEqual(["T-1"])
  }).pipe(
    Effect.scoped,
    Effect.provide(
      engine({
        pull: replies([
          privateSnapshot("1.1", [inboxFact("T-1", 1, "unread")])
        ]),
        mark: () => Effect.fail(new InboxRejected())
      })
    )
  )
)

it.live("forgetting the private copy empties it", () =>
  Effect.gen(function* () {
    const { client, seen } = yield* listed
    yield* client.InboxPull()
    yield* Queue.take(seen)
    yield* Queue.take(seen)
    yield* client.InboxForget()
    expect(yield* Queue.take(seen)).toBe(null)
  }).pipe(
    Effect.scoped,
    Effect.provide(
      engine({
        pull: replies([
          privateSnapshot("1.1", [inboxFact("T-1", 1, "unread")])
        ]),
        mark: () => Effect.succeed(null)
      })
    )
  )
)
