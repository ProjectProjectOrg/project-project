import { it } from "@effect/vitest"
import type { LocalProject, LocalStatus } from "@pp/local"
import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { expect } from "vitest"

import {
  backgroundCandidates,
  BYTES_PER_TICKET,
  LARGE_PROJECT_TICKETS,
  RECENTLY_OPENED_MS,
  RESYNC_AFTER_MS,
  syncInBackground,
  withOpened
} from "./backgroundSync"
import type { BackgroundSteps, Candidate } from "./backgroundSync"

const at = (slug: string): LocalProject => ({ orgSlug: "org", slug })
const live: LocalStatus = { kind: "ready", sync: "live" }
const recent = (slug: string): Candidate => ({ project: at(slug), openedAt: 0 })
const unopened = (slug: string): Candidate => ({
  project: at(slug),
  openedAt: null
})

const fakeSteps = (overrides: Partial<BackgroundSteps> = {}) => {
  const log: Array<string> = []
  const steps: BackgroundSteps = {
    idle: Effect.void,
    input: Effect.never,
    connection: Effect.succeed(null),
    hydrated: () => Effect.succeed(false),
    ticketCount: () => Effect.succeed(100),
    storage: Effect.succeed(null),
    sync: (project) =>
      Effect.sync(() => {
        log.push(`sync ${project.slug}`)
        return live
      }),
    warm: (project) => Effect.sync(() => log.push(`warm ${project.slug}`)),
    ...overrides
  }
  return { log, steps }
}

it("records an opened project first and keeps the list short", () => {
  const opened = ["a", "b", "c", "d", "e", "f"].map((slug, index) => ({
    orgSlug: "org",
    slug,
    openedAt: index
  }))
  expect(withOpened(opened, at("c"), 99).map((entry) => entry.slug)).toEqual([
    "c",
    "a",
    "b",
    "d",
    "e",
    "f"
  ])
})

it("picks recently opened projects first, then the org's newest, up to five", () => {
  const candidates = backgroundCandidates({
    current: at("here"),
    opened: [
      { ...at("older"), openedAt: 1 },
      { ...at("here"), openedAt: 3 },
      { ...at("newer"), openedAt: 2 }
    ],
    orgProjects: ["here", "newer", "x", "y", "z", "w"].map(at),
    syncedAt: new Map(),
    now: 10
  })
  expect(
    candidates.map(({ project, openedAt }) => [project.slug, openedAt])
  ).toEqual([
    ["newer", 2],
    ["older", 1],
    ["x", null],
    ["y", null],
    ["z", null]
  ])
})

it("leaves out projects synced in the background a moment ago", () => {
  const candidates = backgroundCandidates({
    current: at("here"),
    opened: [],
    orgProjects: ["fresh", "stale"].map(at),
    syncedAt: new Map([
      ["org/fresh", 1_000],
      ["org/stale", 1_000 - RESYNC_AFTER_MS]
    ]),
    now: 1_000
  })
  expect(candidates.map(({ project }) => project.slug)).toEqual(["stale"])
})

it.effect("syncs one project at a time and warms each after it", () =>
  Effect.gen(function* () {
    const { log, steps } = fakeSteps()
    yield* syncInBackground([recent("a"), unopened("b")], steps)
    expect(log).toEqual(["sync a", "warm a", "sync b", "warm b"])
  })
)

it.effect(
  "skips a large first sync unless the project was opened recently",
  () =>
    Effect.gen(function* () {
      const { log, steps } = fakeSteps({
        ticketCount: () => Effect.succeed(LARGE_PROJECT_TICKETS + 1)
      })
      yield* syncInBackground(
        [
          unopened("never"),
          { project: at("long-ago"), openedAt: -RECENTLY_OPENED_MS },
          recent("recent")
        ],
        steps
      )
      expect(log).toEqual(["sync recent", "warm recent"])
    })
)

it.effect("catches up an existing copy whatever its size", () =>
  Effect.gen(function* () {
    const { log, steps } = fakeSteps({
      hydrated: () => Effect.succeed(true),
      ticketCount: () => Effect.die("a catch-up does not count tickets")
    })
    yield* syncInBackground([unopened("big")], steps)
    expect(log).toEqual(["sync big", "warm big"])
  })
)

it.effect("skips a first sync that would not fit in the free storage", () =>
  Effect.gen(function* () {
    const { log, steps } = fakeSteps({
      ticketCount: () => Effect.succeed(10_000),
      storage: Effect.succeed({
        usage: 0,
        quota: 10_000 * BYTES_PER_TICKET
      })
    })
    yield* syncInBackground([recent("a")], steps)
    expect(log).toEqual([])
  })
)

it.effect("stops when data saver is on or the connection is slow", () =>
  Effect.gen(function* () {
    for (const connection of [
      { saveData: true, effectiveType: "4g" },
      { saveData: false, effectiveType: "3g" }
    ]) {
      const { log, steps } = fakeSteps({
        connection: Effect.succeed(connection)
      })
      yield* syncInBackground([recent("a")], steps)
      expect(log).toEqual([])
    }
  })
)

it.effect("stops once the server can't be reached", () =>
  Effect.gen(function* () {
    const { log, steps } = fakeSteps({
      sync: (project) =>
        Effect.sync(() => {
          log.push(`sync ${project.slug}`)
          return { kind: "ready", sync: "offline" } satisfies LocalStatus
        })
    })
    yield* syncInBackground([recent("a"), recent("b")], steps)
    expect(log).toEqual(["sync a"])
  })
)

it.effect("signing out interrupts the running sync and starts no other", () =>
  Effect.gen(function* () {
    const started = yield* Deferred.make<void>()
    const interrupted = yield* Deferred.make<void>()
    const { log, steps } = fakeSteps({
      sync: (project) =>
        Effect.sync(() => log.push(`sync ${project.slug}`)).pipe(
          Effect.andThen(Deferred.succeed(started, undefined)),
          Effect.andThen(Effect.never),
          Effect.onInterrupt(() => Deferred.succeed(interrupted, undefined))
        )
    })
    const fiber = yield* Effect.forkChild(
      syncInBackground([recent("a"), recent("b")], steps)
    )
    yield* Deferred.await(started)
    yield* Fiber.interrupt(fiber)
    yield* Deferred.await(interrupted)
    expect(log).toEqual(["sync a"])
  })
)

it.effect("pauses a sync on user input and picks it up again once idle", () =>
  Effect.gen(function* () {
    let attempts = 0
    const { log, steps } = fakeSteps({
      input: Effect.suspend(() =>
        attempts === 1 ? Effect.void : Effect.never
      ),
      idle: Effect.sync(() => log.push("idle")),
      sync: (project) =>
        Effect.suspend(() => {
          attempts++
          log.push(`sync ${project.slug}`)
          return attempts === 1 ? Effect.never : Effect.succeed(live)
        })
    })
    yield* syncInBackground([recent("a")], steps)
    expect(log).toEqual(["idle", "sync a", "idle", "sync a", "warm a"])
  })
)
