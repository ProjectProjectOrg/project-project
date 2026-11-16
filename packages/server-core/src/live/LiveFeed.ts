import { Db } from "@pp/db"
import { member, organization } from "@pp/db/schema"
import {
  CurrentUser,
  type LiveCursor,
  type LiveEvent,
  OrgScope,
  permits
} from "@pp/shared"
import { eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Stream from "effect/Stream"

import * as Access from "../access/Access"
import * as SyncLog from "../sync/SyncLog"
import * as LiveChanges from "./LiveChanges"
import { changesOf, decodeCursor, encodeCursor, isNewer } from "./liveCursor"

export class LiveFeed extends Context.Service<
  LiveFeed,
  Readonly<{
    forCurrentUser: (
      after: LiveCursor | undefined
    ) => Effect.Effect<Stream.Stream<LiveEvent>, never, CurrentUser>
  }>
>()("@pp/server-core/live/LiveFeed") {}

const HEARTBEAT_INTERVAL = "5 seconds"
const REPLAY_LIMIT = 500

type FeedItem =
  | Readonly<{ kind: "tick" }>
  | Readonly<{ kind: "entry"; entry: LiveChanges.LiveEntry }>

const make = Effect.gen(function* () {
  const db = yield* Db
  const access = yield* Access.Access
  const syncLog = yield* SyncLog.SyncLog
  const liveChanges = yield* LiveChanges.LiveChanges

  const readableProjects = Effect.gen(function* () {
    const user = yield* CurrentUser
    const orgs = yield* db
      .select({ slug: organization.slug })
      .from(member)
      .innerJoin(organization, eq(organization.id, member.organizationId))
      .where(eq(member.userId, user.id))
      .pipe(Effect.orDie)
    const scopes = yield* Effect.forEach(orgs, ({ slug }) =>
      access.org(slug).pipe(
        Effect.flatMap((orgScope) =>
          access.projectsInOrg().pipe(Effect.provideService(OrgScope, orgScope))
        ),
        Effect.catchTag("NotFound", () => Effect.succeed([]))
      )
    )
    return new Map(
      scopes
        .flat()
        .filter((scope) => permits(scope.permissions, { ticket: ["read"] }))
        .map((scope): [string, LiveChanges.LiveProject] => [
          scope.projectId,
          {
            projectId: scope.projectId,
            orgSlug: scope.orgSlug,
            slug: scope.slug
          }
        ])
    )
  })

  const start = (
    readable: ReadonlyMap<string, LiveChanges.LiveProject>,
    after: LiveCursor | undefined
  ) =>
    Effect.gen(function* () {
      const vector = new Map<string, SyncLog.SyncPosition>()
      const replay: Array<LiveChanges.LiveEntry> = []
      const previous = after === undefined ? undefined : decodeCursor(after)
      let resync = previous === null
      for (const project of readable.values()) {
        const head = yield* syncLog.head(project.projectId).pipe(Effect.orDie)
        const known = previous?.get(project.projectId)
        if (previous === undefined || previous === null) {
          vector.set(project.projectId, head)
          continue
        }
        if (known === undefined || known.generation !== head.generation) {
          resync = true
          vector.set(project.projectId, head)
          continue
        }
        const entries = yield* syncLog
          .entriesAfter(project.projectId, known, REPLAY_LIMIT + 1)
          .pipe(Effect.orDie)
        if (entries.length > REPLAY_LIMIT) {
          resync = true
          vector.set(project.projectId, head)
          continue
        }
        vector.set(project.projectId, known)
        for (const entry of entries)
          replay.push({ ...project, ...entry, reset: false })
      }
      return { vector, replay, resync, fresh: after === undefined }
    })

  const forCurrentUser = (after: LiveCursor | undefined) =>
    Effect.gen(function* () {
      const user = yield* CurrentUser
      const readable = yield* readableProjects

      const stillReadable = (project: LiveChanges.LiveProject) =>
        access.project(project.orgSlug, project.slug).pipe(
          Effect.map((scope) =>
            permits(scope.permissions, { ticket: ["read"] })
          ),
          Effect.catchTag("NotFound", () => Effect.succeed(false)),
          Effect.provideService(CurrentUser, user)
        )

      return Stream.unwrap(
        Effect.gen(function* () {
          const subscription = yield* liveChanges.subscribe
          const { vector, replay, resync, fresh } = yield* start(
            readable,
            after
          )
          const cursor = () => encodeCursor(vector)
          const opening: ReadonlyArray<LiveEvent> = resync
            ? [{ kind: "resync", cursor: cursor() }]
            : fresh
              ? [{ kind: "heartbeat", cursor: cursor() }]
              : []

          const toEvents = (
            item: FeedItem
          ): Effect.Effect<ReadonlyArray<LiveEvent>> =>
            Effect.gen(function* () {
              if (item.kind === "tick")
                return [{ kind: "heartbeat", cursor: cursor() } as const]
              const { entry } = item
              if (!readable.has(entry.projectId)) return []
              if (!isNewer(vector, entry)) return []
              if (!(yield* stillReadable(entry))) return []
              vector.set(entry.projectId, entry)
              return changesOf(entry, cursor())
            })

          const entries = Stream.concat(
            Stream.fromIterable(replay),
            Stream.fromSubscription(subscription)
          ).pipe(Stream.map((entry): FeedItem => ({ kind: "entry", entry })))

          return Stream.concat(
            Stream.fromIterable(opening),
            Stream.merge(
              entries,
              Stream.tick(HEARTBEAT_INTERVAL).pipe(
                Stream.drop(1),
                Stream.map((): FeedItem => ({ kind: "tick" }))
              )
            ).pipe(
              Stream.mapEffect(toEvents),
              Stream.flatMap((events) => Stream.fromIterable(events))
            )
          )
        })
      )
    })

  return LiveFeed.of({ forCurrentUser })
})

export const layer = Layer.effect(LiveFeed, make)
