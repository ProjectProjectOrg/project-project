import * as SqliteClient from "@effect/sql-sqlite-wasm/SqliteClient"
import { it } from "@effect/vitest"
import {
  type TicketDescription,
  TicketId,
  type UpdateTicketDescriptionInput
} from "@pp/shared"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { RpcTest } from "effect/rpc"
import * as Schedule from "effect/Schedule"
import * as TestClock from "effect/testing/TestClock"
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
import { localDatabase } from "./LocalDb"
import { LocalRpcs } from "./LocalRpcs"
import { SyncSource } from "./SyncSource"
import { changes } from "./testFacts"

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

const engine = (source: DescriptionSource["Service"]) =>
  localRpcsLayer.pipe(
    Layer.provide(
      Layer.succeed(SyncSource, {
        pull: () => Effect.succeed(changes("1.1", [], []))
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

it.effect(
  "over budget, the least recently used description goes first and a pending edit stays",
  () =>
    Effect.gen(function* () {
      yield* storeDescriptions(scope, [description("T-1", "aaaaaa", "1.1")])
      yield* recordEdit({
        project,
        id: "T-1",
        body: "edited",
        base: { body: "aaaaaa", revision: "1.1" }
      })
      yield* TestClock.adjust("1 second")
      yield* storeDescriptions(scope, [description("T-2", "bbbbbb", "1.1")])
      yield* TestClock.adjust("1 second")
      yield* storeDescriptions(scope, [description("T-3", "cccccc", "1.1")], 12)
      expect(yield* describe(scope, "T-1")).not.toBeNull()
      expect(yield* describe(scope, "T-2")).toBeNull()
      expect(yield* describe(scope, "T-3")).not.toBeNull()
    }).pipe(Effect.provide(TestDatabase))
)

it.live(
  "saves queued while a write is in flight go to the server as one write",
  () => {
    const release = Deferred.makeUnsafe<void>()
    const saves: Array<string> = []
    const source: DescriptionSource["Service"] = {
      fetch: () => Effect.succeed([]),
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
