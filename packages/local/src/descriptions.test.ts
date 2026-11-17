import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type DescriptionPage,
  GroupId,
  type ProjectSync,
  type TicketDescription,
  TicketId,
  type UpdateTicketDescriptionInput
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { RpcTest } from "effect/rpc"
import * as Schedule from "effect/Schedule"
import * as Stream from "effect/Stream"
import { expect } from "vitest"

import {
  describe,
  localDescriptionsLayer,
  recordEdit,
  storeDescriptions
} from "./descriptions"
import {
  DescriptionSource,
  SaveOutcome,
  type SaveOutcome as Outcome
} from "./DescriptionSource"
import { localRpcsLayer } from "./handlers"
import { type LocalDb, localDatabase } from "./LocalDb"
import { LocalRpcs } from "./LocalRpcs"
import { PendingWrites } from "./pendingWrites"
import { SyncOffline, SyncSource } from "./SyncSource"
import { changes, onePage, pageOf, snapshot, ticket } from "./testFacts"

const scope = "a/p"
const project = { orgSlug: "a", slug: "p" }

const description = (
  id: string,
  body: string,
  revision: string
): TicketDescription => ({
  id: TicketId.make(id),
  body,
  revision,
  missingAttachments: []
})

const TestDatabase = localDatabase(SqliteClient.makeMemory({}))

const quiet: DescriptionSource["Service"] = {
  fetch: () => Effect.succeed([]),
  page: () => Effect.succeed({ descriptions: [], groups: [], next: null }),
  group: () => Effect.die(new Error("groups get is not called")),
  save: () => Effect.succeed(SaveOutcome.Rejected({ reason: "test" }))
}

const engine = (
  source: DescriptionSource["Service"],
  pull: SyncSource["Service"]["pull"] = () =>
    Effect.succeed(changes("1.1", [], []))
) =>
  localRpcsLayer.pipe(
    Layer.provide(Layer.succeed(SyncSource, { pull })),
    Layer.provide(
      Layer.succeed(PendingWrites, {
        operationId: Effect.succeed("operation-1"),
        send: () => Effect.fail(new SyncOffline())
      })
    ),
    Layer.provide(
      localDescriptionsLayer.pipe(
        Layer.provide(Layer.succeed(DescriptionSource, source))
      )
    )
  )

type Saved = Readonly<{
  input: UpdateTicketDescriptionInput
  operation: string
}>

const recording = (
  respond: (input: UpdateTicketDescriptionInput, call: number) => Outcome,
  theirs: ReadonlyArray<TicketDescription> = []
) => {
  const saves: Array<Saved> = []
  const source: DescriptionSource["Service"] = {
    ...quiet,
    fetch: () => Effect.succeed(theirs),
    save: (_project, _id, input, operation) =>
      Effect.sync(() => {
        saves.push({ input, operation })
        return respond(input, saves.length)
      })
  }
  return { saves, source }
}

const eventually = <A, E, R>(
  check: Effect.Effect<A, E, R>,
  done: (value: A) => boolean
) =>
  check.pipe(
    Effect.repeat({
      until: done,
      schedule: Schedule.spaced("5 millis")
    })
  )

const confirmed = (input: UpdateTicketDescriptionInput, revision: string) =>
  SaveOutcome.Saved({
    description: description("T-1", input.body, revision)
  })

it.effect("a fetched description older than the one held is ignored", () =>
  Effect.gen(function* () {
    yield* storeDescriptions(scope, [description("T-1", "newer", "1.5")])
    yield* storeDescriptions(scope, [description("T-1", "older", "1.3")])
    expect((yield* describe(scope, "T-1"))?.server).toEqual({
      body: "newer",
      revision: "1.5"
    })
    yield* storeDescriptions(scope, [description("T-1", "next", "2.1")])
    expect((yield* describe(scope, "T-1"))?.server.body).toBe("next")
  }).pipe(Effect.provide(TestDatabase))
)

it.live(
  "saves queued while a write is in flight go to the server as one write",
  () => {
    const release = Deferred.makeUnsafe<void>()
    const saves: Array<string> = []
    const source: DescriptionSource["Service"] = {
      ...quiet,
      save: (_project, _id, input) =>
        Effect.gen(function* () {
          saves.push(input.body)
          if (saves.length === 1) yield* Deferred.await(release)
          return confirmed(input, `1.${saves.length + 1}`)
        })
    }
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LocalRpcs)
      const base = { body: "start", revision: "1.1" }
      yield* client.SaveDescription({ project, id: "T-1", body: "a", base })
      yield* eventually(
        Effect.sync(() => saves.length),
        (n) => n === 1
      )
      yield* client.SaveDescription({ project, id: "T-1", body: "ab", base })
      yield* client.SaveDescription({ project, id: "T-1", body: "abc", base })
      yield* Deferred.succeed(release, undefined)
      const settled = yield* eventually(
        describe(scope, "T-1"),
        (value) => value?.edit === null
      )
      expect(saves).toEqual(["a", "abc"])
      expect(settled?.server.body).toBe("abc")
    }).pipe(
      Effect.scoped,
      Effect.provide(engine(source).pipe(Layer.provideMerge(TestDatabase)))
    )
  }
)

it.live("an edit not yet confirmed is sent again after a reload", () => {
  const { saves, source } = recording((input) => confirmed(input, "1.2"))
  return Effect.gen(function* () {
    yield* recordEdit({
      project,
      id: "T-1",
      body: "typed before the reload",
      base: { body: "start", revision: "1.1" }
    })
    yield* Layer.build(engine(source))
    yield* eventually(
      Effect.sync(() => saves.length),
      (n) => n === 1
    )
    expect(saves[0]?.input).toEqual({
      body: "typed before the reload",
      base: "1.1"
    })
  }).pipe(Effect.scoped, Effect.provide(TestDatabase))
})

const base = ["# Plan", "first line", "second line"].join("\n")
const mine = ["# Plan", "first line, mine", "second line"].join("\n")

it.live(
  "an edit made while someone else changed other lines is merged onto their version",
  () => {
    const theirs = description(
      "T-1",
      ["# Plan", "first line", "second line, theirs"].join("\n"),
      "1.7"
    )
    const { saves, source } = recording(
      (input, call) =>
        call === 1 ? SaveOutcome.Changed() : confirmed(input, "1.8"),
      [theirs]
    )
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LocalRpcs)
      yield* client.SaveDescription({
        project,
        id: "T-1",
        body: mine,
        base: { body: base, revision: "1.1" }
      })
      yield* eventually(describe(scope, "T-1"), (value) => value?.edit === null)
      expect(saves.map((save) => save.input)).toEqual([
        { body: mine, base: "1.1" },
        {
          body: ["# Plan", "first line, mine", "second line, theirs"].join(
            "\n"
          ),
          base: "1.7"
        }
      ])
    }).pipe(
      Effect.scoped,
      Effect.provide(engine(source).pipe(Layer.provideMerge(TestDatabase)))
    )
  }
)

it.live(
  "an edit to lines someone else also changed keeps the draft and stops saving",
  () => {
    const theirs = description(
      "T-1",
      ["# Plan", "first line, theirs", "second line"].join("\n"),
      "1.7"
    )
    const { saves, source } = recording(() => SaveOutcome.Changed(), [theirs])
    return Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(LocalRpcs)
      yield* client.SaveDescription({
        project,
        id: "T-1",
        body: mine,
        base: { body: base, revision: "1.1" }
      })
      const blocked = yield* eventually(
        describe(scope, "T-1"),
        (value) => value?.edit?.conflict != null
      )
      expect(blocked?.edit).toMatchObject({
        body: mine,
        conflict: { body: theirs.body, revision: "1.7" }
      })
      expect(saves).toHaveLength(1)
    }).pipe(
      Effect.scoped,
      Effect.provide(engine(source).pipe(Layer.provideMerge(TestDatabase)))
    )
  }
)

const syncing = (responses: Array<ProjectSync>) => () =>
  Effect.sync(() =>
    responses.length > 1
      ? (responses.shift() ?? changes("1.1", [], []))
      : (responses[0] ?? changes("1.1", [], []))
  )

const onePageOf = (
  descriptions: ReadonlyArray<TicketDescription>
): DescriptionPage => ({ descriptions, groups: [], next: null })

it.live("the description phase resumes from its page after a restart", () => {
  const requested: Array<string | null> = []
  const source: DescriptionSource["Service"] = {
    ...quiet,
    page: (_project, token) =>
      Effect.suspend(() => {
        requested.push(token)
        if (token === null)
          return Effect.succeed({
            descriptions: [description("T-1", "one", "0.0")],
            groups: [],
            next: "second"
          })
        return requested.length === 2
          ? Effect.never
          : Effect.succeed(onePageOf([description("T-2", "two", "0.0")]))
      })
  }
  const pull = syncing([
    onePage("1.1", [ticket("T-1", "one"), ticket("T-2", "two")]),
    changes("1.1", [], [])
  ])
  const run = <E>(until: Effect.Effect<unknown, E, LocalDb>) =>
    Effect.scoped(
      Effect.gen(function* () {
        const context = yield* Layer.build(engine(source, pull))
        const client = yield* RpcTest.makeClient(LocalRpcs).pipe(
          Effect.provide(context)
        )
        yield* client.Pull(project)
        yield* until
      })
    )
  return Effect.gen(function* () {
    yield* run(
      Effect.andThen(
        eventually(describe(scope, "T-1"), (value) => value !== null),
        eventually(
          Effect.sync(() => requested.length),
          (n) => n === 2
        )
      )
    )
    yield* run(eventually(describe(scope, "T-2"), (value) => value !== null))
    expect(requested).toEqual([null, "second", "second"])
    expect((yield* describe(scope, "T-1"))?.server.body).toBe("one")
  }).pipe(Effect.provide(TestDatabase))
})

const synced = (
  source: DescriptionSource["Service"],
  responses: Array<ProjectSync>
) =>
  Effect.gen(function* () {
    const context = yield* Layer.build(engine(source, syncing(responses)))
    const client = yield* RpcTest.makeClient(LocalRpcs).pipe(
      Effect.provide(context)
    )
    yield* client.Pull(project)
    return client
  })

it.live("a moved description revision fetches the description again", () => {
  const fetched: Array<ReadonlyArray<string>> = []
  const source: DescriptionSource["Service"] = {
    ...quiet,
    page: () => Effect.succeed(onePageOf([description("T-1", "first", "0.0")])),
    fetch: (_project, ids) =>
      Effect.sync(() => {
        fetched.push(ids)
        return [description("T-1", "second", "1.2")]
      })
  }
  const responses = [
    onePage("1.1", [ticket("T-1", "one")]),
    changes("1.1", [], [])
  ]
  return Effect.gen(function* () {
    const client = yield* synced(source, responses)
    yield* eventually(describe(scope, "T-1"), (value) => value !== null)
    responses.splice(
      0,
      responses.length,
      {
        ...changes(
          "1.2",
          [{ ...ticket("T-1", "one"), descriptionRevision: "1.2" }],
          []
        ),
        cursor: "1.2"
      },
      changes("1.2", [], [])
    )
    yield* client.Pull(project)
    const settled = yield* eventually(
      describe(scope, "T-1"),
      (value) => value?.server.body === "second"
    )
    expect(settled?.server.revision).toBe("1.2")
    expect(fetched).toEqual([["T-1"]])
  }).pipe(Effect.scoped, Effect.provide(TestDatabase))
})

it.live("a deleted ticket's description is removed", () => {
  const source: DescriptionSource["Service"] = {
    ...quiet,
    page: () => Effect.succeed(onePageOf([description("T-1", "one", "0.0")]))
  }
  const responses = [
    onePage("1.1", [ticket("T-1", "one")]),
    changes("1.1", [], [])
  ]
  return Effect.gen(function* () {
    const client = yield* synced(source, responses)
    yield* eventually(describe(scope, "T-1"), (value) => value !== null)
    responses.splice(
      0,
      responses.length,
      changes("1.2", [], ["T-1"]),
      changes("1.2", [], [])
    )
    yield* client.Pull(project)
    expect(yield* describe(scope, "T-1")).toBeNull()
  }).pipe(Effect.scoped, Effect.provide(TestDatabase))
})

it.live("a sprint's description is served from the copy", () => {
  const sprint = GroupId.make("G-1")
  const at = DateTime.toDateUtc(DateTime.makeUnsafe("2026-11-16T10:00:00Z"))
  const full = {
    ...snapshot("1.1", [ticket("T-1", "one")]),
    groups: [
      {
        id: sprint,
        kind: "sprint" as const,
        name: "Sprint 1",
        color: "#123456",
        startsAt: null,
        endsAt: null,
        completedAt: null,
        createdBy: "user-1",
        createdAt: at,
        updatedAt: at,
        tickets: ["T-1"]
      }
    ]
  }
  const source: DescriptionSource["Service"] = {
    ...quiet,
    page: () =>
      Effect.succeed({
        descriptions: [],
        groups: [{ id: sprint, body: "Ship it", revision: "1.1" }],
        next: null
      })
  }
  return Effect.gen(function* () {
    const client = yield* synced(source, [pageOf(full), changes("1.1", [], [])])
    const detail = yield* client.GroupDetail({ project, id: sprint }).pipe(
      Stream.filter((value) => value !== null),
      Stream.runHead
    )
    expect(detail).toMatchObject({
      _tag: "Some",
      value: { id: "G-1", name: "Sprint 1", tickets: ["T-1"], body: "Ship it" }
    })
  }).pipe(Effect.scoped, Effect.provide(TestDatabase))
})
