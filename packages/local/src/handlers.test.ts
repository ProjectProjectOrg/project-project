import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type GroupFact,
  type ProjectSync,
  type ProjectSyncQuery,
  TicketId,
  TicketListQuery,
  TicketStatus,
  Validation
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as Queue from "effect/Queue"
import { RpcTest } from "effect/rpc"
import * as Schema from "effect/Schema"
import * as Stream from "effect/Stream"
import * as TestClock from "effect/testing/TestClock"
import { expect } from "vitest"

import { localRpcsLayer } from "./handlers"
import { localDatabase } from "./LocalDb"
import { type LocalProject, LocalRpcs } from "./LocalRpcs"
import { Intent, PendingWrite } from "./pending"
import { PendingWrites } from "./pendingWrites"
import { SyncOffline, SyncSource } from "./SyncSource"
import {
  changes,
  noDescriptions,
  onePage,
  pageOf,
  snapshot,
  ticket
} from "./testFacts"

const responses: Array<ProjectSync> = [
  onePage("1.1", [ticket("T-1", "one")]),
  changes("1.1", [], []),
  changes("1.2", [ticket("T-1", "renamed")], [])
]

const unsent: PendingWrites["Service"] = {
  operationId: Effect.succeed("operation-1"),
  send: () => Effect.fail(new SyncOffline())
}

const engineWith = (
  pull: SyncSource["Service"]["pull"],
  writes: PendingWrites["Service"] = unsent
) =>
  localRpcsLayer.pipe(
    Layer.provideMerge(Layer.succeed(SyncSource, { pull })),
    Layer.provideMerge(Layer.succeed(PendingWrites, writes)),
    Layer.provideMerge(noDescriptions),
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
    expect(yield* client.Pull(project)).toEqual({
      kind: "ready",
      sync: "live"
    })
    expect(asked).toEqual([
      {},
      { page: "page-2" },
      { page: "page-2" },
      { after: "1.1" }
    ])
  }).pipe(Effect.scoped, Effect.provide(engineWith(pull)))
})

it.effect("pages fetched ahead are applied in page order", () => {
  const asked: Array<ProjectSyncQuery> = []
  const pages = new Map<string, ProjectSync>([
    [
      "page-2",
      {
        ...onePage("1.1", [ticket("T-2", "two")]),
        start: null,
        next: "page-3"
      }
    ],
    ["page-3", { ...onePage("1.1", [ticket("T-3", "three")]), start: null }]
  ])
  const pull = (_: LocalProject, request: ProjectSyncQuery) =>
    Effect.sync((): ProjectSync => {
      asked.push(request)
      if (request.after !== undefined) return changes("1.1", [], [])
      if (request.page !== undefined)
        return pages.get(request.page) ?? changes("1.1", [], [])
      return { ...onePage("1.1", [ticket("T-1", "one")]), next: "page-2" }
    })
  return Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LocalRpcs)
    yield* client.Pull(project)
    const titles = yield* client
      .Titles(project)
      .pipe(Stream.take(1), Stream.runCollect)
    expect(asked).toEqual([
      {},
      { page: "page-2" },
      { page: "page-3" },
      { after: "1.1" }
    ])
    expect(titles[0]?.map((title) => title.id)).toEqual(["T-1", "T-2", "T-3"])
  }).pipe(Effect.scoped, Effect.provide(engineWith(pull)))
})

it.effect(
  "an edit the server never received is sent again under its operation id on the next pull",
  () => {
    const sent: Array<string> = []
    let online = false
    const writes: PendingWrites["Service"] = {
      operationId: Effect.succeed("operation-1"),
      send: (_project, operationId) =>
        Effect.suspend(() => {
          sent.push(operationId)
          return online
            ? Effect.succeed({ receipt: "project-1.1.2", created: null })
            : Effect.fail(new SyncOffline())
        })
    }
    const pulls: Array<ProjectSync> = [onePage("1.1", [ticket("T-1", "one")])]
    const pull = () =>
      Effect.sync(() => pulls.shift() ?? changes("1.1", [], []))
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LocalRpcs)
      yield* client.Pull(project)
      yield* client.Edit({
        project,
        write: PendingWrite.cases.update.make({
          ticket: TicketId.make("T-1"),
          payload: { priority: "high" }
        }),
        edits: [
          {
            ticket: "T-1",
            intents: [Intent.cases.priority.make({ priority: "high" })]
          }
        ]
      })
      online = true
      yield* client.Pull(project)
      yield* client.Pull(project)
      expect(sent).toEqual(["operation-1", "operation-1"])
    }).pipe(Effect.scoped, Effect.provide(engineWith(pull, writes)))
  }
)

it.effect(
  "a rejected edit fails with the server's error and is never sent again",
  () => {
    const sent: Array<string> = []
    const writes: PendingWrites["Service"] = {
      operationId: Effect.succeed("operation-1"),
      send: (_project, operationId) =>
        Effect.suspend(() => {
          sent.push(operationId)
          return Effect.fail(new Validation({ reason: "invalid_status" }))
        })
    }
    const pulls: Array<ProjectSync> = [onePage("1.1", [ticket("T-1", "one")])]
    const pull = () =>
      Effect.sync(() => pulls.shift() ?? changes("1.1", [], []))
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LocalRpcs)
      yield* client.Pull(project)
      const error = yield* client
        .Edit({
          project,
          write: PendingWrite.cases.update.make({
            ticket: TicketId.make("T-1"),
            payload: { status: TicketStatus.make("nope") }
          }),
          edits: [
            {
              ticket: "T-1",
              intents: [Intent.cases.status.make({ status: "nope" })]
            }
          ]
        })
        .pipe(Effect.flip)
      yield* client.Pull(project)
      expect(error).toEqual(new Validation({ reason: "invalid_status" }))
      expect(sent).toEqual(["operation-1"])
    }).pipe(Effect.scoped, Effect.provide(engineWith(pull, writes)))
  }
)

it.effect("an edit made offline is sent once the server is reachable", () => {
  const sent: Array<string> = []
  let online = false
  const writes: PendingWrites["Service"] = {
    operationId: Effect.succeed("operation-1"),
    send: (_project, operationId) =>
      Effect.suspend(() => {
        if (!online) return Effect.fail(new SyncOffline())
        sent.push(operationId)
        return Effect.succeed({ receipt: "1.1", created: null })
      })
  }
  const pulls: Array<ProjectSync> = [onePage("1.1", [ticket("T-1", "one")])]
  const pull = () => Effect.sync(() => pulls.shift() ?? changes("1.1", [], []))
  return Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LocalRpcs)
    yield* client.Pull(project)
    yield* client.Edit({
      project,
      write: PendingWrite.cases.update.make({
        ticket: TicketId.make("T-1"),
        payload: { title: "renamed" }
      }),
      edits: [
        {
          ticket: "T-1",
          intents: [Intent.cases.title.make({ title: "renamed" })]
        }
      ]
    })
    yield* TestClock.adjust("5 seconds")
    online = true
    yield* TestClock.adjust("5 seconds")
    expect(sent).toEqual(["operation-1"])
  }).pipe(Effect.scoped, Effect.provide(engineWith(pull, writes)))
})

const hoursIn = (hours: number) =>
  DateTime.toDateUtc(DateTime.makeUnsafe(hours * 3_600_000))

const sprintStarting = (id: string, hours: number): GroupFact => ({
  id,
  kind: "sprint",
  name: id,
  color: "blue",
  startsAt: hoursIn(hours),
  endsAt: null,
  completedAt: null,
  tickets: [],
  createdBy: "user-1",
  createdAt: hoursIn(0),
  updatedAt: hoursIn(0)
})

it.effect("an open sprint view re-runs when a sprint starts", () =>
  Effect.gen(function* () {
    const client = yield* RpcTest.makeClient(LocalRpcs)
    yield* client.Pull(project)
    const orders = yield* Queue.unbounded<string>()
    const fiber = yield* client
      .SprintSections({
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
            orders,
            (result?.sections ?? []).map((section) => section.key).join(" ")
          )
        ),
        Effect.forkScoped
      )
    expect(yield* Queue.take(orders)).toBe("G-1 unscheduled G-2")
    yield* TestClock.adjust("1 hour")
    expect(yield* Queue.take(orders)).toBe("unscheduled G-2 G-1")
    yield* Fiber.interrupt(fiber)
  }).pipe(
    Effect.scoped,
    Effect.provide(
      engineWith((_project, query) =>
        Effect.succeed(
          query.after === undefined
            ? pageOf({
                ...snapshot("1.1", [ticket("T-1", "one")]),
                groups: [sprintStarting("G-1", 1), sprintStarting("G-2", 0)]
              })
            : changes("1.1", [], [])
        )
      )
    )
  )
)
