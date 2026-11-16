import {
  type ProjectChanges,
  type SnapshotPage,
  snapshotFromPages
} from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Reactivity from "effect/reactivity/Reactivity"
import * as Semaphore from "effect/Semaphore"
import * as SqlClient from "effect/sql/SqlClient"
import * as Stream from "effect/Stream"

import { localSprintBoard } from "./board"
import { localGroupList } from "./groups"
import {
  type CountsRequest,
  type LocalProject,
  LocalRpcs,
  type LocalStatus,
  type LocalSyncState,
  scopeOf,
  type SectionsRequest
} from "./LocalRpcs"
import { localParentSections } from "./parents"
import type { PendingWrite } from "./pending"
import { PendingWrites } from "./pendingWrites"
import { localCounts, localSections } from "./sections"
import { localSequence } from "./sequence"
import { localSprintSections } from "./sprints"
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
import { SyncSource } from "./SyncSource"
import { localTicketList, repositoryFrom } from "./ticketList"
import { localTitles } from "./titles"

const sectionsRequest = (request: SectionsRequest, copy: number) => ({
  copy,
  query: request.query,
  viewerId: request.viewerId,
  estimation: request.estimation,
  repository: (repoId: string | null) =>
    repoId === null
      ? request.repositories.fallback
      : (request.repositories.byId[repoId] ?? null),
  perStatus: (status: string) =>
    request.pageSize * (1 + (request.pages[status] ?? 0))
})

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

const projectKey = (scope: string) => `local-project:${scope}`

const touches = (changes: ProjectChanges) =>
  changes.project !== null ||
  Object.values(changes.upserts).some((facts) => facts.length > 0) ||
  Object.values(changes.deletes).some((ids) => ids.length > 0)

export const localRpcsLayer = LocalRpcs.toLayer(
  Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient
    const reactivity = yield* Reactivity.Reactivity
    const source = yield* SyncSource
    const writes = yield* PendingWrites
    const sender = yield* Semaphore.make(1)
    const inFlight = new Set<string>()
    const writer = yield* Semaphore.make(1)
    const loops = new Map<string, Semaphore.Semaphore>()
    const write = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      writer.withPermit(effect)
    const changed = (scope: string) =>
      reactivity.invalidate([projectKey(scope)])

    const loopFor = (scope: string) =>
      Effect.gen(function* () {
        const existing = loops.get(scope)
        if (existing !== undefined) return existing
        const created = yield* Semaphore.make(1)
        loops.set(scope, created)
        return created
      })

    const retire = (copy: number) =>
      write(dropCopyBatch(copy)).pipe(
        Effect.repeat({ until: (dropped) => dropped })
      )

    const restart = (scope: string, page: SnapshotPage) =>
      Effect.gen(function* () {
        const abandoned = yield* write(beginStaging(scope, page))
        if (abandoned !== null) yield* retire(abandoned)
      })

    const step = (project: LocalProject) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const staging = yield* stagingOf(scope)
        if (staging !== null) {
          if (staging.next === null) {
            const published = yield* write(publishStaging(scope))
            yield* changed(scope)
            if (published?.retired != null) yield* retire(published.retired)
            return "again" as const
          }
          const page = yield* source.pull(project, { page: staging.next })
          if (page.kind !== "snapshot")
            return yield* Effect.die(new Error("expected a snapshot page"))
          if (page.start !== null) yield* restart(scope, page)
          else yield* write(applyPage(scope, staging.next, page))
          return "again" as const
        }
        const current = yield* syncOf(scope)
        const response = yield* source.pull(
          project,
          current === null ? {} : { after: current.cursor }
        )
        if (response.kind === "snapshot") {
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
          write
        )
        if (applied === "applied" && touches(response)) yield* changed(scope)
        return applied === "stale" || response.more
          ? ("again" as const)
          : ("caughtUp" as const)
      })

    const forgetCopies = (scope: string) =>
      Effect.gen(function* () {
        const copies = yield* write(forget(scope))
        yield* changed(scope)
        for (const copy of copies) yield* retire(copy)
      })

    const pullUntilCaughtUp = (project: LocalProject) =>
      Effect.flatMap(loopFor(scopeOf(project)), (loop) =>
        loop.withPermit(
          step(project).pipe(
            Effect.repeat({ until: (state) => state === "caughtUp" })
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
        Effect.flatMap((receipt) =>
          write(confirmEdit(scope, id, receipt)).pipe(Effect.orDie)
        ),
        Effect.flatMap((settled) => (settled ? changed(scope) : Effect.void)),
        Effect.as("sent" as const),
        Effect.catchTag("SyncOffline", () =>
          Effect.succeed("offline" as const)
        ),
        Effect.tapError(() =>
          write(rejectEdit(scope, id)).pipe(
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
          ).pipe(Effect.orElseSucceed(() => "rejected" as const))
          if (delivered === "offline") return
        }
      }).pipe(
        Effect.catchCause((cause) =>
          Effect.logWarning("resending local edits failed", cause)
        )
      )

    const edit = (
      project: LocalProject,
      pending: PendingWrite,
      edits: NewEdit["edits"]
    ) =>
      Effect.gen(function* () {
        const scope = scopeOf(project)
        const id = yield* writes.operationId
        inFlight.add(id)
        yield* write(recordEdit(scope, { id, write: pending, edits })).pipe(
          Effect.orDie
        )
        yield* changed(scope)
        yield* deliver(project, id, pending)
      })

    const pull = (project: LocalProject) => {
      const scope = scopeOf(project)
      return resend(project).pipe(
        Effect.andThen(pullUntilCaughtUp(project)),
        Effect.as<LocalStatus>({ kind: "ready", sync: "live" }),
        Effect.catchTags({
          SyncDenied: () =>
            forgetCopies(scope).pipe(
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
      project: LocalProject,
      read: (copy: number) => Effect.Effect<A | null, E, R>
    ) =>
      sql.withTransaction(
        Effect.flatMap(copyOf(scopeOf(project)), (copy) =>
          copy === null ? Effect.succeed(null) : read(copy)
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
            readCopy(request.project, (copy) =>
              localSections(sectionsRequest(request, copy))
            )
          )
          .pipe(Stream.orDie),
      SprintSections: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy(request.project, (copy) =>
              Effect.flatMap(DateTime.nowAsDate, (now) =>
                localSprintSections({
                  ...sectionsRequest(request, copy),
                  perSection: (key) =>
                    request.pageSize * (1 + (request.pages[key] ?? 0)),
                  now
                })
              )
            )
          )
          .pipe(Stream.orDie),
      ParentSections: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy(request.project, (copy) =>
              Effect.flatMap(DateTime.nowAsDate, (now) =>
                localParentSections({
                  ...sectionsRequest(request, copy),
                  by: request.by,
                  pages: request.pages,
                  pageSize: request.pageSize,
                  now
                })
              )
            )
          )
          .pipe(Stream.orDie),
      Counts: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy(request.project, (copy) =>
              localCounts(countsRequest(request, copy))
            )
          )
          .pipe(Stream.orDie),
      TicketList: (request) =>
        sql
          .reactive(
            [projectKey(scopeOf(request.project))],
            readCopy(request.project, (copy) =>
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
            readCopy(request.project, (copy) =>
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
            readCopy(project, localGroupList)
          )
          .pipe(Stream.orDie),
      Titles: (project) =>
        sql
          .reactive(
            [projectKey(scopeOf(project))],
            readCopy(project, localTitles)
          )
          .pipe(Stream.orDie),
      Sequence: (request) =>
        readCopy(request.project, (copy) =>
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
          edit(request.project, request.write, request.edits)
        )
    }
  })
)
