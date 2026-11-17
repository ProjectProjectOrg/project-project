import {
  type ProjectChanges,
  type ProjectSync,
  type SnapshotPage,
  snapshotFromPages
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Latch from "effect/Latch"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Semaphore from "effect/Semaphore"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import { localSprintBoard } from "./board"
import {
  descriptionKey,
  groupDescriptionKey,
  LocalDescriptions,
  localGroupDetail
} from "./descriptions"
import { localGroupList } from "./groups"
import { type LocalDb, timed } from "./LocalDb"
import {
  type CountsRequest,
  type LocalProject,
  LocalRpcs,
  type LocalStatus,
  type LocalSyncState,
  scopeOf
} from "./LocalRpcs"
import { localTicket } from "./localTicket"
import type { PendingWrite } from "./pending"
import { PendingWrites } from "./pendingWrites"
import { localProjectFacts } from "./projectFacts"
import { localCounts } from "./sections"
import { localSequence } from "./sequence"
import { groupMembership } from "./sprints"
import {
  type NewEdit,
  applyChanges,
  applyPage,
  beginStaging,
  confirmEdit,
  copyOf,
  cursorOf,
  differences,
  dropCopyBatch,
  forget,
  publishStaging,
  readFacts,
  recordEdit,
  rejectEdit,
  snapshotFacts,
  stagingOf,
  syncOf,
  unsentEdits
} from "./store"
import { type SyncDenied, type SyncOffline, SyncSource } from "./SyncSource"
import { localTicketList, repositoryFrom } from "./ticketList"
import { localTitles } from "./titles"
import {
  ParentSectionsView,
  projectKey,
  readParentSections,
  readSections,
  readSprintSections,
  SectionsView,
  servedFirst,
  SprintSectionsView,
  WarmView
} from "./views"

const countsRequest = (request: CountsRequest, copy: number) => ({
  copy,
  query: request.query,
  viewerId: request.viewerId,
  estimation: request.estimation
})

const unavailable = (scope: string, state: LocalSyncState) =>
  Effect.map(
    cursorOf(scope),
    (cursor): LocalStatus =>
      cursor === null ? { kind: "failed" } : { kind: "ready", sync: state }
  )

const touches = (changes: ProjectChanges) =>
  changes.project !== null ||
  Object.values(changes.upserts).some((facts) => facts.length > 0) ||
  Object.values(changes.deletes).some((ids) => ids.length > 0)

const OFFLINE = "offline" as const

const nextTask = Effect.callback<void>((resume) => {
  const channel = new MessageChannel()
  channel.port1.addEventListener("message", () => {
    channel.port1.close()
    resume(Effect.void)
  })
  channel.port1.start()
  channel.port2.postMessage(null)
})

export const localRpcsLayer = LocalRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const reactivity = yield* Reactivity.Reactivity
    const source = yield* SyncSource
    const writes = yield* PendingWrites
    const sender = yield* Semaphore.make(1)
    const inFlight = new Set<string>()
    const writing = yield* Semaphore.make(1)
    const loops = new Map<string, Semaphore.Semaphore>()
    const noReads = yield* Latch.make(true)
    let reads = 0
    const reading = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      Effect.acquireUseRelease(
        Effect.sync(() => {
          reads += 1
          noReads.closeUnsafe()
        }),
        () => effect,
        () =>
          Effect.sync(() => {
            reads -= 1
            if (reads === 0) noReads.openUnsafe()
          })
      )
    const write =
      (label: string) =>
      <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        writing.withPermit(
          Effect.andThen(noReads.await, timed(`write ${label}`)(effect))
        )
    const writer = (label: string) => ({
      write: write(label),
      readsWaiting: Effect.map(nextTask, () => reads > 0)
    })
    const changed = (scope: string) =>
      reactivity.invalidate([projectKey(scope)])
    const descriptions = yield* LocalDescriptions
    const warm = yield* WarmView

    const sprintStarts = new Map<string, Fiber.Fiber<void>>()
    const refreshAtNextSprintStart = (
      scope: string
    ): Effect.Effect<void, never, LocalDb> =>
      Effect.gen(function* () {
        const previous = sprintStarts.get(scope)
        sprintStarts.delete(scope)
        if (previous !== undefined) yield* Fiber.interrupt(previous)
        const copy = yield* copyOf(scope)
        if (copy === null) return
        const now = yield* DateTime.nowAsDate
        const next = Math.min(
          ...(yield* groupMembership(copy)).sprints.flatMap((sprint) =>
            sprint.startsAt !== null && sprint.startsAt > now
              ? [sprint.startsAt.getTime()]
              : []
          )
        )
        if (next === Infinity) return
        sprintStarts.set(
          scope,
          yield* Effect.forkDetach(
            Effect.sleep(next - now.getTime()).pipe(
              Effect.andThen(
                Effect.sync(() => {
                  sprintStarts.delete(scope)
                })
              ),
              Effect.andThen(changed(scope)),
              Effect.andThen(refreshAtNextSprintStart(scope))
            )
          )
        )
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("scheduling the next sprint start failed", cause)
        )
      )

    const loopFor = (scope: string) =>
      Effect.gen(function* () {
        const existing = loops.get(scope)
        if (existing !== undefined) return existing
        const created = yield* Semaphore.make(1)
        loops.set(scope, created)
        return created
      })

    const retire = (copy: number) =>
      write("drop")(dropCopyBatch(copy)).pipe(
        Effect.repeat({ until: (dropped) => dropped })
      )

    const restart = (scope: string, page: SnapshotPage) =>
      Effect.gen(function* () {
        const abandoned = yield* beginStaging(scope, page, writer("begin"))
        for (const copy of abandoned) yield* retire(copy)
      })

    type Ahead = Readonly<{
      token: string
      fiber: Fiber.Fiber<ProjectSync, SyncDenied | SyncOffline>
    }>

    const pagesOf = (project: LocalProject) => {
      let ahead: Ahead | null = null
      const fetch = (token: string) =>
        Effect.gen(function* () {
          const taken = ahead
          ahead = null
          if (taken?.token === token) return yield* Fiber.join(taken.fiber)
          if (taken !== null) yield* Fiber.interrupt(taken.fiber)
          return yield* source.pull(project, { page: token })
        })
      const prefetch = (page: SnapshotPage) =>
        Effect.gen(function* () {
          if (page.next === null) return
          ahead = {
            token: page.next,
            fiber: yield* Effect.forkScoped(
              source.pull(project, { page: page.next }),
              { startImmediately: true }
            )
          }
        })
      return { fetch, prefetch }
    }

    type Pages = ReturnType<typeof pagesOf>

    const step = (project: LocalProject, pages: Pages) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const staging = yield* stagingOf(scope)
        if (staging !== null) {
          if (staging.next === null) {
            const published = yield* publishStaging(scope, writer("publish"))
            yield* changed(scope)
            if (published?.retired != null) yield* retire(published.retired)
            return "again" as const
          }
          const page = yield* pages.fetch(staging.next)
          if (page.kind !== "snapshot")
            return yield* Effect.die(new Error("expected a snapshot page"))
          yield* pages.prefetch(page)
          if (page.start !== null) yield* restart(scope, page)
          else yield* applyPage(scope, staging.next, page, writer("page"))
          return "again" as const
        }
        const current = yield* syncOf(scope)
        const response = yield* source.pull(
          project,
          current === null ? {} : { after: current.cursor }
        )
        if (response.kind === "snapshot") {
          yield* pages.prefetch(response)
          yield* restart(scope, response)
          return "again" as const
        }
        if (current === null) return "again" as const
        if (response.git !== (current.git === 1)) {
          yield* forgetCopies(scope)
          return "again" as const
        }
        const applied = yield* applyChanges(
          scope,
          current.cursor,
          response,
          write("changes")
        )
        if (applied === "applied" && touches(response)) yield* changed(scope)
        if (applied === "applied") yield* descriptions.notice(project, response)
        return applied === "stale" || response.more
          ? ("again" as const)
          : ("caughtUp" as const)
      })

    const forgetCopies = (scope: string) =>
      Effect.gen(function* () {
        const copies = yield* write("forget")(forget(scope))
        yield* changed(scope)
        for (const copy of copies) yield* retire(copy)
      })

    const pullUntilCaughtUp = (project: LocalProject) =>
      Effect.flatMap(loopFor(scopeOf(project)), (loop) =>
        loop.withPermit(
          Effect.scoped(
            Effect.suspend(() => {
              const pages = pagesOf(project)
              return step(project, pages).pipe(
                Effect.repeat({ until: (state) => state === "caughtUp" })
              )
            })
          )
        )
      )

    const deliver = (
      project: LocalProject,
      id: string,
      pending: PendingWrite
    ) => {
      const scope = scopeOf(project)
      return sender.withPermit(writes.send(project, id, pending)).pipe(
        Effect.tap((sent) =>
          write("confirm")(confirmEdit(scope, id, sent.receipt)).pipe(
            Effect.orDie,
            Effect.flatMap((settled) =>
              settled ? changed(scope) : Effect.void
            )
          )
        ),
        Effect.map((sent) => sent.created),
        Effect.catchTag("SyncOffline", () => Effect.succeed(OFFLINE)),
        Effect.tapError(() =>
          write("reject")(rejectEdit(scope, id)).pipe(
            Effect.andThen(changed(scope)),
            Effect.orDie
          )
        ),
        Effect.ensuring(Effect.sync(() => inFlight.delete(id)))
      )
    }

    const resend = (project: LocalProject) =>
      Effect.gen(function* () {
        for (const unsent of yield* unsentEdits(scopeOf(project))) {
          if (inFlight.has(unsent.id)) continue
          inFlight.add(unsent.id)
          const delivered = yield* deliver(
            project,
            unsent.id,
            unsent.write
          ).pipe(Effect.orElseSucceed(() => null))
          if (delivered === OFFLINE) return
        }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("resending local edits failed", cause)
        )
      )

    const edit = (
      project: LocalProject,
      pending: PendingWrite,
      edits: NewEdit["edits"],
      groups: NewEdit["groups"]
    ) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const id = yield* writes.operationId
        inFlight.add(id)
        yield* write("edit")(
          recordEdit(scope, { id, write: pending, edits, groups })
        ).pipe(Effect.orDie)
        yield* changed(scope)
        const delivered = yield* deliver(project, id, pending)
        return delivered === OFFLINE ? null : delivered
      })

    const pull = (project: LocalProject) => {
      const scope = scopeOf(project)
      return resend(project).pipe(
        Effect.andThen(pullUntilCaughtUp(project)),
        Effect.andThen(refreshAtNextSprintStart(scope)),
        Effect.andThen(descriptions.start(project, writer("descriptions"))),
        Effect.as<LocalStatus>({ kind: "ready", sync: "live" }),
        Effect.catchTags({
          SyncDenied: () =>
            forgetCopies(scope).pipe(
              Effect.andThen(descriptions.forget(scope)),
              Effect.as<LocalStatus>({ kind: "denied" })
            ),
          SyncOffline: () => unavailable(scope, "offline")
        }),
        Effect.catchCause((cause) =>
          Effect.logWarning("local copy sync failed", cause).pipe(
            Effect.andThen(unavailable(scope, "erroring"))
          )
        ),
        Effect.orElseSucceed((): LocalStatus => ({ kind: "failed" }))
      )
    }

    const collectSnapshot = (project: LocalProject, first: SnapshotPage) =>
      Effect.gen(function* () {
        let page = first
        let pages = [page]
        let start = page.start
        while (page.next !== null) {
          const next = yield* source.pull(project, { page: page.next })
          if (next.kind !== "snapshot")
            return yield* Effect.die(new Error("expected a snapshot page"))
          page = next
          if (page.start === null) pages.push(page)
          else {
            pages = [page]
            start = page.start
          }
        }
        if (start === null)
          return yield* Effect.die(new Error("snapshot without a start page"))
        return snapshotFromPages(start, pages, page.base)
      })

    const checkFacts = (project: LocalProject) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const first = yield* source.pull(project, {})
        if (first.kind !== "snapshot")
          return yield* Effect.logInfo("local copy shadow check got changes")
        const server = yield* collectSnapshot(project, first)
        const local = yield* readFacts(scope)
        if (local.cursor !== server.cursor)
          return yield* Effect.logInfo(
            `local copy of ${scope} is at ${local.cursor}, server at ${server.cursor}; shadow check skipped`
          )
        const differing = differences(local, snapshotFacts(server))
        return yield* differing.length === 0
          ? Effect.logInfo(
              `local copy of ${scope} matches the server at ${server.cursor}`
            )
          : Effect.logWarning(
              `local copy of ${scope} differs from the server at ${server.cursor}`,
              differing
            )
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("local copy shadow check failed", cause)
        )
      )

    const readCopy = <A, E, R>(
      label: string,
      project: LocalProject,
      read: (copy: number) => Effect.Effect<A | null, E, R>
    ) =>
      timed(`read ${label}`)(
        reading(
          sql.withTransaction(
            Effect.flatMap(copyOf(scopeOf(project)), (copy) =>
              copy === null ? Effect.succeed(null) : read(copy)
            )
          )
        )
      )

    return {
      Hydrated: (project) =>
        cursorOf(scopeOf(project)).pipe(
          Effect.map((cursor) => cursor !== null),
          Effect.orDie
        ),
      Pull: pull,
      CheckFacts: checkFacts,
      Sections: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            servedFirst(
              warm,
              SectionsView.make({ request }),
              readSections(request),
              Match.valueTags({
                Sections: ({ value }) => Option.some(value),
                SprintSections: () => Option.none(),
                ParentSections: () => Option.none()
              })
            )
          )
          .pipe(Stream.orDie),
      SprintSections: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            servedFirst(
              warm,
              SprintSectionsView.make({ request }),
              readSprintSections(request),
              Match.valueTags({
                Sections: () => Option.none(),
                SprintSections: ({ value }) => Option.some(value),
                ParentSections: () => Option.none()
              })
            )
          )
          .pipe(Stream.orDie),
      ParentSections: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            servedFirst(
              warm,
              ParentSectionsView.make({ request }),
              readParentSections(request),
              Match.valueTags({
                Sections: () => Option.none(),
                SprintSections: () => Option.none(),
                ParentSections: ({ value }) => Option.some(value)
              })
            )
          )
          .pipe(Stream.orDie),
      Counts: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy("Counts", request.project, (copy) =>
              localCounts(countsRequest(request, copy))
            )
          )
          .pipe(Stream.orDie),
      TicketList: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy("TicketList", request.project, (copy) =>
              localTicketList({
                copy,
                query: request.query,
                viewerId: request.viewerId,
                estimation: request.estimation,
                repository: repositoryFrom(request.repositories)
              })
            )
          )
          .pipe(Stream.orDie),
      SprintBoard: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy("SprintBoard", request.project, (copy) =>
              localSprintBoard({
                copy,
                groupId: request.groupId,
                repository: repositoryFrom(request.repositories)
              })
            )
          )
          .pipe(Stream.orDie),
      Groups: (project) =>
        sql
          .reactive(
            [projectKey(scopeOf(project))],
            readCopy("Groups", project, localGroupList)
          )
          .pipe(Stream.orDie),
      Titles: (project) =>
        sql
          .reactive(
            [projectKey(scopeOf(project))],
            readCopy("Titles", project, localTitles)
          )
          .pipe(Stream.orDie),
      Sequence: (request) =>
        readCopy("Sequence", request.project, (copy) =>
          Effect.flatMap(DateTime.nowAsDate, (now) =>
            localSequence({
              copy,
              id: request.id,
              from: request.from,
              viewerId: request.viewerId,
              estimation: request.estimation,
              now
            })
          )
        ).pipe(Effect.orDie),
      Edit: (request) =>
        Effect.uninterruptible(
          edit(request.project, request.write, request.edits, request.groups)
        ),
      Ticket: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy("Ticket", request.project, (copy) =>
              localTicket(copy, request.id, (repoId) =>
                repoId === null
                  ? request.repositories.fallback
                  : (request.repositories.byId[repoId] ?? null)
              )
            )
          )
          .pipe(Stream.orDie),
      Description: (request) => {
        const scope = scopeOf(request.project)
        return sql
          .reactive(
            [projectKey(scope), descriptionKey(scope, request.id)],
            descriptions.view(request)
          )
          .pipe(Stream.orDie)
      },
      SaveDescription: (request) =>
        descriptions.save(request).pipe(Effect.orDie),
      ResolveDescription: (request) =>
        descriptions.resolve(request).pipe(Effect.orDie),
      CachedTicketData: (request) =>
        descriptions.cached(request).pipe(Effect.orDie),
      CacheTicketData: (request) =>
        descriptions.cache(request).pipe(Effect.orDie),
      ProjectFacts: (project) =>
        sql
          .reactive(
            [projectKey(scopeOf(project))],
            readCopy("ProjectFacts", project, localProjectFacts)
          )
          .pipe(Stream.orDie),
      GroupDetail: (request) => {
        const scope = scopeOf(request.project)
        return sql
          .reactive(
            [projectKey(scope), groupDescriptionKey(scope, request.id)],
            readCopy("GroupDetail", request.project, (copy) =>
              localGroupDetail(scope, copy, request.id)
            )
          )
          .pipe(Stream.orDie)
      }
    }
  })
)
