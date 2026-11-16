import type { PrivateChanges, PrivateSnapshotPage } from "@pp/shared"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Semaphore from "effect/Semaphore"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import { type InboxMark, InboxSource } from "./inboxSource"
import {
  applyInboxChanges,
  applyInboxPage,
  beginInbox,
  dropInboxCopy,
  INBOX_SCOPE,
  type InboxCandidates,
  listedCandidates,
  unreadCandidates
} from "./inboxStore"
import {
  INBOX_LIMIT,
  inboxList,
  isSettled,
  type PendingMark,
  pendingKeys,
  unreadCount,
  withPending
} from "./inboxView"
import type {
  InboxRequest,
  InboxUnreadRequest,
  LocalStatus,
  LocalSyncState
} from "./LocalRpcs"
import { forget, publishStaging, stagingOf, syncOf } from "./store"

const INBOX_KEY = "local-inbox"

const touches = (changes: PrivateChanges) =>
  changes.upserts.length > 0 || changes.deletes.length > 0

const unavailable = (state: LocalSyncState) =>
  Effect.map(
    syncOf(INBOX_SCOPE),
    (current): LocalStatus =>
      current === null ? { kind: "failed" } : { kind: "ready", sync: state }
  )

export const inboxHandlers = (
  write: <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const reactivity = yield* Reactivity.Reactivity
    const source = yield* InboxSource
    const crypto = yield* Crypto.Crypto
    const loop = yield* Semaphore.make(1)
    const sending = yield* Semaphore.make(1)
    const pending = new Map<string, PendingMark>()
    const changed = reactivity.invalidate([INBOX_KEY])

    const restart = (page: PrivateSnapshotPage) =>
      Effect.gen(function* () {
        const abandoned = yield* write(beginInbox(page))
        if (abandoned !== null) yield* write(dropInboxCopy(abandoned))
      })

    const step = Effect.gen(function* () {
      const staging = yield* stagingOf(INBOX_SCOPE)
      if (staging !== null) {
        if (staging.next === null) {
          const published = yield* write(publishStaging(INBOX_SCOPE))
          yield* changed
          if (published?.retired != null)
            yield* write(dropInboxCopy(published.retired))
          return "again" as const
        }
        const page = yield* source.pull({ page: staging.next })
        if (page.kind !== "snapshot")
          return yield* Effect.die(new Error("expected a snapshot page"))
        if (page.first) yield* restart(page)
        else yield* write(applyInboxPage(staging.next, page))
        return "again" as const
      }
      const current = yield* syncOf(INBOX_SCOPE)
      const response = yield* source.pull(
        current === null ? {} : { after: current.cursor }
      )
      if (response.kind === "snapshot") {
        yield* restart(response)
        return "again" as const
      }
      if (current === null) return "again" as const
      const applied = yield* write(applyInboxChanges(current.cursor, response))
      if (applied === "applied" && touches(response)) yield* changed
      return applied === "stale" || response.more
        ? ("again" as const)
        : ("caughtUp" as const)
    })

    const prune = Effect.gen(function* () {
      const cursor = (yield* syncOf(INBOX_SCOPE))?.cursor ?? null
      for (const [id, mark] of pending)
        if (isSettled(mark, cursor)) pending.delete(id)
    })

    const forgetInbox = Effect.gen(function* () {
      const copies = yield* write(forget(INBOX_SCOPE))
      for (const copy of copies) yield* write(dropInboxCopy(copy))
      pending.clear()
      yield* changed
    })

    const pull = loop
      .withPermit(step.pipe(Effect.repeat({ until: (s) => s === "caughtUp" })))
      .pipe(
        Effect.andThen(prune),
        Effect.as<LocalStatus>({ kind: "ready", sync: "live" }),
        Effect.catchTags({
          SyncDenied: () =>
            forgetInbox.pipe(Effect.as<LocalStatus>({ kind: "denied" })),
          SyncOffline: () => unavailable("offline")
        }),
        Effect.catchCause((cause) =>
          Effect.logWarning("private copy sync failed", cause).pipe(
            Effect.andThen(unavailable("erroring"))
          )
        ),
        Effect.orElseSucceed((): LocalStatus => ({ kind: "failed" }))
      )

    const mark = (mark: InboxMark) =>
      Effect.gen(function* () {
        const id = yield* crypto.randomUUIDv4().pipe(Effect.orDie)
        const at = yield* DateTime.nowAsDate
        pending.set(id, { mark, at, receipt: null })
        yield* changed
        const receipt = yield* sending.withPermit(source.mark(id, mark)).pipe(
          Effect.catchTags({
            InboxRejected: () => Effect.succeed(null),
            SyncOffline: () => Effect.succeed(null)
          })
        )
        if (receipt === null) pending.delete(id)
        else pending.set(id, { mark, at, receipt })
        yield* pull
        yield* changed
      })

    const read = <A, E, R>(
      orgSlug: string,
      view: (
        request: InboxCandidates,
        marks: ReadonlyArray<PendingMark>
      ) => Effect.Effect<A, E, R>
    ) =>
      sql
        .reactive(
          [INBOX_KEY],
          sql.withTransaction(
            Effect.gen(function* () {
              const current = yield* syncOf(INBOX_SCOPE)
              if (current === null) return null
              const marks = [...pending.values()].filter(
                (mark) => !isSettled(mark, current.cursor)
              )
              return yield* view(
                {
                  copy: current.copy,
                  orgSlug,
                  keys: pendingKeys(marks, orgSlug)
                },
                marks
              )
            })
          )
        )
        .pipe(Stream.orDie)

    return {
      InboxPull: () => pull,
      Inbox: (request: InboxRequest) => {
        const readSince = DateTime.toDate(
          DateTime.makeUnsafe(request.readSince)
        )
        return read(request.orgSlug, (candidates, marks) =>
          Effect.map(
            listedCandidates({
              ...candidates,
              readSince: readSince.toISOString(),
              limit: INBOX_LIMIT
            }),
            (rows) =>
              inboxList(withPending(rows, marks, request.orgSlug), readSince)
          )
        )
      },
      InboxUnread: (request: InboxUnreadRequest) =>
        read(request.orgSlug, (candidates, marks) =>
          Effect.map(unreadCandidates(candidates), (rows) =>
            unreadCount(withPending(rows, marks, request.orgSlug))
          )
        ),
      InboxMark: mark,
      InboxForget: () => forgetInbox.pipe(Effect.orDie)
    }
  })
