import { PgClient } from "@effect/sql-pg"
import { Db } from "@pp/db"
import { organization, projectIndex } from "@pp/db/schema"
import { eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as PubSub from "effect/PubSub"
import * as Queue from "effect/Queue"
import * as Schedule from "effect/Schedule"
import type * as Scope from "effect/Scope"

import * as SyncLog from "../sync/SyncLog"

export type LiveProject = Readonly<{
  projectId: string
  orgSlug: string
  slug: string
}>

export type LiveEntry = LiveProject &
  Readonly<{
    generation: number
    sequence: number
    origin: string | null
    changes: SyncLog.SyncEntry["changes"]
    reset: boolean
  }>

export class LiveChanges extends Context.Service<
  LiveChanges,
  Readonly<{
    subscribe: Effect.Effect<PubSub.Subscription<LiveEntry>, never, Scope.Scope>
  }>
>()("@pp/server-core/live/LiveChanges") {}

const SUBSCRIBER_CAPACITY = 4096
const CATCH_UP_LIMIT = 500

const make = Effect.gen(function* () {
  const db = yield* Db
  const pg = yield* PgClient.PgClient
  const syncLog = yield* SyncLog.SyncLog
  const pubsub = yield* Effect.acquireRelease(
    PubSub.sliding<LiveEntry>(SUBSCRIBER_CAPACITY),
    PubSub.shutdown
  )
  const seen = new Map<string, SyncLog.SyncPosition>()
  const projects = new Map<string, LiveProject>()

  const projectOf = Effect.fn("LiveChanges.projectOf")(function* (
    projectId: string
  ) {
    const known = projects.get(projectId)
    if (known !== undefined) return known
    const [row] = yield* db
      .select({ orgSlug: organization.slug, slug: projectIndex.slug })
      .from(projectIndex)
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(eq(projectIndex.id, projectId))
      .limit(1)
    if (row === undefined) return null
    const project = { projectId, ...row }
    projects.set(projectId, project)
    return project
  })

  const catchUp = Effect.fn("LiveChanges.catchUp")(function* (
    projectId: string,
    head: SyncLog.SyncPosition
  ) {
    const project = yield* projectOf(projectId)
    if (project === null) return
    const last = seen.get(projectId)
    if (last === undefined || last.generation !== head.generation) {
      seen.set(projectId, head)
      if (last === undefined && head.sequence > 0) {
        const entries = yield* syncLog.entriesAfter(
          projectId,
          { generation: head.generation, sequence: head.sequence - 1 },
          1
        )
        for (const entry of entries)
          yield* PubSub.publish(pubsub, { ...project, ...entry, reset: false })
        return
      }
      yield* PubSub.publish(pubsub, {
        ...project,
        ...head,
        origin: null,
        changes: [],
        reset: true
      })
      return
    }
    if (head.sequence <= last.sequence) return
    const entries = yield* syncLog.entriesAfter(projectId, last, CATCH_UP_LIMIT)
    for (const entry of entries) {
      seen.set(projectId, entry)
      yield* PubSub.publish(pubsub, { ...project, ...entry, reset: false })
    }
    if (entries.length === CATCH_UP_LIMIT) {
      seen.set(projectId, head)
      yield* PubSub.publish(pubsub, {
        ...project,
        ...head,
        origin: null,
        changes: [],
        reset: true
      })
    }
  })

  const recheckKnown = Effect.suspend(() =>
    Effect.forEach(
      [...seen.keys()],
      (projectId) =>
        syncLog
          .head(projectId)
          .pipe(Effect.flatMap((head) => catchUp(projectId, head))),
      { discard: true }
    )
  )

  const listen = Effect.scoped(
    Effect.gen(function* () {
      const notifications = yield* pg.listen(SyncLog.SYNC_CHANNEL)
      yield* recheckKnown
      while (true) {
        const notification = yield* Queue.take(notifications)
        const parsed = SyncLog.parseNotification(notification.payload)
        if (parsed === null) continue
        yield* catchUp(parsed.projectId, parsed)
      }
    })
  )

  yield* listen.pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("live change listener stopped; reconnecting", cause)
    ),
    Effect.repeat(Schedule.spaced("1 second")),
    Effect.forkScoped
  )

  return LiveChanges.of({ subscribe: PubSub.subscribe(pubsub) })
})

export const layer = Layer.effect(LiveChanges, make)
