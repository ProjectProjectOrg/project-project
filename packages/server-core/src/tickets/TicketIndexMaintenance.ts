import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  commentIndex,
  organization,
  projectIndex,
  ticketBranch,
  ticketIndex,
  user
} from "@pp/db/schema"
import {
  and,
  eq,
  getTableColumns,
  inArray,
  or,
  sql as drizzleSql
} from "drizzle-orm"
import * as Cause from "effect/Cause"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as SqlClient from "effect/sql/SqlClient"

import { parseCommentsRegion } from "../comments/comments-region"
import type { MarkdownError } from "../markdown/Markdown"
import { TicketDocs, type TicketDocument } from "./TicketDocs"
import type { MalformedTicketDocument } from "./TicketDocs"
import type {
  TicketIndexRebuildProjectSummary,
  TicketIndexRebuildSummary,
  TicketIndexReconcileOptions,
  TicketIndexReconcileProjectSummary,
  TicketIndexReconcileSummary,
  TicketIndexDrift
} from "./TicketIndex"
import { ticketBranchRowsFor, ticketIndexRowFor } from "./TicketIndexLive"
import * as TicketIndexRepairs from "./TicketIndexRepairs"
import type { TicketProject } from "./ticketProject"

export const ticketIndexRowsFor = (
  project: TicketProject,
  documents: ReadonlyArray<TicketDocument>
): ReadonlyArray<typeof ticketIndex.$inferInsert> =>
  documents.map((document) => ticketIndexRowFor(project, document))

const commentIndexRowsForDocument = (
  project: TicketProject,
  document: TicketDocument
): ReadonlyArray<typeof commentIndex.$inferInsert> =>
  parseCommentsRegion(document.commentsRegion).map((comment) => ({
    id: comment.id,
    projectId: project.projectId,
    ticketId: document.id,
    origin: comment.origin,
    authorKind: comment.author.kind,
    authorId: comment.author.kind === "user" ? comment.author.userId : null,
    jiraDisplayName:
      comment.author.kind === "jira" ? comment.author.displayName : null,
    jiraAccountId:
      comment.author.kind === "jira" ? comment.author.accountId : null,
    createdAt: comment.createdAt,
    editedAt: comment.editedAt
  }))

export const commentIndexRowsFor = (
  project: TicketProject,
  documents: ReadonlyArray<TicketDocument>
): ReadonlyArray<typeof commentIndex.$inferInsert> =>
  documents.flatMap((document) =>
    commentIndexRowsForDocument(project, document)
  )

const nextTicketNumberFor = (
  documents: ReadonlyArray<TicketDocument>
): number =>
  documents.reduce((next, document) => {
    const dash = document.id.lastIndexOf("-")
    const number = Number(document.id.slice(dash + 1))
    return Number.isSafeInteger(number) ? Math.max(next, number + 1) : next
  }, 1)

export interface IndexedTicketRef {
  readonly ticketId: string
  readonly updatedAt: Date
}

export interface DocumentTicketRef {
  readonly id: string
  readonly updatedAt: Date
}

export const detectTicketIndexDrift = (
  indexed: ReadonlyArray<IndexedTicketRef>,
  documents: ReadonlyArray<DocumentTicketRef>
): TicketIndexDrift => {
  const indexedTimes = new Map(
    indexed.map((row) => [row.ticketId, row.updatedAt.getTime()])
  )
  const documentTimes = new Map(
    documents.map((doc) => [doc.id, doc.updatedAt.getTime()])
  )
  const missing: Array<string> = []
  const stale: Array<string> = []
  for (const [id, time] of documentTimes) {
    const indexedTime = indexedTimes.get(id)
    if (indexedTime === undefined) missing.push(id)
    else if (indexedTime !== time) stale.push(id)
  }
  const orphaned: Array<string> = []
  for (const id of indexedTimes.keys()) {
    if (!documentTimes.has(id)) orphaned.push(id)
  }
  return {
    missing: missing.sort(),
    orphaned: orphaned.sort(),
    stale: stale.sort()
  }
}

export const ticketIndexHasDrift = (drift: TicketIndexDrift): boolean =>
  drift.missing.length > 0 ||
  drift.orphaned.length > 0 ||
  drift.stale.length > 0

export interface TicketIndexReconcilerDeps {
  readonly listProjects: Effect.Effect<ReadonlyArray<TicketProject>>
  readonly collectDocuments: (
    project: TicketProject
  ) => Effect.Effect<
    { documents: ReadonlyArray<TicketDocument>; skipped: number },
    MarkdownError
  >
  readonly indexedRefs: (
    project: TicketProject
  ) => Effect.Effect<ReadonlyArray<IndexedTicketRef>>
  readonly writeProject: (
    project: TicketProject,
    documents: ReadonlyArray<TicketDocument>,
    indexedBefore: ReadonlyArray<IndexedTicketRef>
  ) => Effect.Effect<void>
}

export const makeTicketIndexReconciler = (deps: TicketIndexReconcilerDeps) => {
  const reconcileProject = (
    project: TicketProject,
    options?: TicketIndexReconcileOptions
  ): Effect.Effect<TicketIndexReconcileProjectSummary, MarkdownError> =>
    Effect.gen(function* () {
      const indexedBefore = yield* deps.indexedRefs(project)
      const { documents, skipped } = yield* deps.collectDocuments(project)
      const indexed = yield* deps.indexedRefs(project)
      const drift = detectTicketIndexDrift(
        indexed,
        documents.map((doc) => ({ id: doc.id, updatedAt: doc.updatedAt }))
      )
      const shouldRebuild =
        (options?.force ?? false) || ticketIndexHasDrift(drift)
      if (!shouldRebuild) {
        return {
          project,
          drift,
          rebuilt: false,
          indexed: indexed.length,
          skipped
        }
      }
      if (ticketIndexHasDrift(drift)) {
        yield* Effect.logWarning("ticket index drift detected; rebuilding", {
          orgSlug: project.orgSlug,
          slug: project.slug,
          projectId: project.projectId,
          missing: drift.missing,
          orphaned: drift.orphaned,
          stale: drift.stale,
          indexedCount: indexed.length,
          documentCount: documents.length
        })
      }
      yield* deps.writeProject(project, documents, indexedBefore)
      return {
        project,
        drift,
        rebuilt: true,
        indexed: documents.length,
        skipped
      }
    })

  const reconcileAllProjects = (): Effect.Effect<
    TicketIndexReconcileSummary,
    MarkdownError
  > =>
    Effect.gen(function* () {
      const projects = yield* deps.listProjects
      const results = yield* Effect.forEach(
        projects,
        (project) =>
          reconcileProject(project).pipe(
            Effect.map((summary) => [summary]),
            Effect.catchCause((cause) =>
              Cause.hasInterrupts(cause)
                ? Effect.failCause(cause)
                : Effect.logError(
                    "ticket index project reconcile failed",
                    cause
                  ).pipe(
                    Effect.annotateLogs({
                      orgSlug: project.orgSlug,
                      slug: project.slug
                    }),
                    Effect.as([])
                  )
            )
          ),
        { concurrency: 1 }
      )
      const summaries = results.flat()
      return {
        projects: summaries,
        reconciled: summaries.filter((summary) => summary.rebuilt).length
      }
    })

  return { reconcileProject, reconcileAllProjects }
}

const TICKET_INDEX_REPAIR_INTERVAL = "5 seconds"
const REPAIR_BACKOFF_BASE_MS = 5_000
const REPAIR_BACKOFF_MAX_MS = 5 * 60_000

export class TicketIndexMaintenance extends Context.Service<
  TicketIndexMaintenance,
  Readonly<{
    rebuildProject: (
      project: TicketProject
    ) => Effect.Effect<
      TicketIndexRebuildProjectSummary,
      MarkdownError | MalformedTicketDocument
    >
    rebuildAllProjects: () => Effect.Effect<
      TicketIndexRebuildSummary,
      MarkdownError | MalformedTicketDocument
    >
    reconcileProject: (
      project: TicketProject,
      options?: TicketIndexReconcileOptions
    ) => Effect.Effect<
      TicketIndexReconcileProjectSummary,
      MarkdownError | MalformedTicketDocument
    >
    reconcileAllProjects: () => Effect.Effect<
      TicketIndexReconcileSummary,
      MarkdownError | MalformedTicketDocument
    >
  }>
>()("@pp/server-core/tickets/TicketIndexMaintenance") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const ticketDocs = yield* TicketDocs
  const repairs = yield* TicketIndexRepairs.TicketIndexRepairs

  const collectDocuments = (project: TicketProject) =>
    Effect.gen(function* () {
      const ids = yield* ticketDocs.listIds(project.orgSlug, project.slug)
      const reads = yield* Effect.forEach(
        ids,
        (id) =>
          ticketDocs.read(project.orgSlug, project.slug, id).pipe(
            Effect.map((ticket) => ({ ticket, skipped: false as const })),
            Effect.catchTag("MalformedTicketDocument", (error) =>
              Effect.logWarning("Skipping unreadable ticket for ticket index", {
                orgSlug: project.orgSlug,
                slug: project.slug,
                ticketId: id,
                error
              }).pipe(Effect.as({ ticket: null, skipped: true as const }))
            ),
            Effect.catchTag("NotFound", () =>
              Effect.logDebug("Skipping vanished ticket for ticket index", {
                orgSlug: project.orgSlug,
                slug: project.slug,
                ticketId: id
              }).pipe(Effect.as({ ticket: null, skipped: true as const }))
            )
          ),
        { concurrency: 8 }
      )
      const documents = reads.flatMap((read) =>
        read.ticket === null ? [] : [read.ticket]
      )
      const skipped = reads.filter((read) => read.skipped).length
      return { documents, skipped }
    })

  const branchCacheColumns = new Set<string>([
    "prUpdatedAt",
    "branchDeletedAt",
    "checks",
    "checksHeadSha",
    "checksUpdatedAt"
  ])

  const excludedTicketIndexColumns = (row: object) =>
    Object.fromEntries([
      ...Object.entries(getTableColumns(ticketIndex))
        .filter(
          ([key]) => key in row && key !== "projectId" && key !== "ticketId"
        )
        .map(([key, column]) => [
          key,
          drizzleSql.raw(`excluded.${column.name}`)
        ]),
      ...Object.entries(getTableColumns(ticketIndex))
        .filter(([key]) => branchCacheColumns.has(key))
        .map(([key, column]) => [
          key,
          drizzleSql`case when ${ticketIndex.branch} is distinct from excluded.branch then null else ${column} end`
        ])
    ])

  const writeProjectIndex = (
    project: TicketProject,
    documents: ReadonlyArray<TicketDocument>,
    indexedBefore: ReadonlyArray<IndexedTicketRef>
  ): Effect.Effect<void> => {
    const tickets = ticketIndexRowsFor(project, documents)
    const allComments = commentIndexRowsFor(project, documents)
    return sql
      .withTransaction(
        Effect.gen(function* () {
          // Comments by since-deleted users would fail the author foreign key.
          const authorIds = [
            ...new Set(
              allComments.flatMap((comment) =>
                comment.authorId == null ? [] : [comment.authorId]
              )
            )
          ]
          const knownAuthors =
            authorIds.length === 0
              ? new Set<string>()
              : new Set(
                  (yield* db
                    .select({ id: user.id })
                    .from(user)
                    .where(inArray(user.id, authorIds))
                    .pipe(Effect.orDie)).map((row) => row.id)
                )
          const comments = allComments.filter(
            (comment) =>
              comment.authorId == null || knownAuthors.has(comment.authorId)
          )
          const documentIds = new Set<string>(
            documents.map((document) => document.id)
          )
          const missing = indexedBefore.filter(
            (ref) => !documentIds.has(ref.ticketId)
          )
          const documentUpdatedAt = new Map(
            documents.map((document) => [
              document.id as string,
              document.updatedAt.getTime()
            ])
          )
          const aheadOfDisk = indexedBefore.filter(
            (ref) =>
              ref.updatedAt.getTime() >
              (documentUpdatedAt.get(ref.ticketId) ?? Infinity)
          )
          const removed =
            missing.length === 0
              ? []
              : yield* db
                  .delete(ticketIndex)
                  .where(
                    and(
                      eq(ticketIndex.projectId, project.projectId),
                      or(
                        ...missing.map((ref) =>
                          and(
                            eq(ticketIndex.ticketId, ref.ticketId),
                            eq(ticketIndex.updatedAt, ref.updatedAt)
                          )
                        )
                      )
                    )
                  )
                  .returning({ ticketId: ticketIndex.ticketId })
          const written =
            tickets.length === 0
              ? []
              : yield* db
                  .insert(ticketIndex)
                  .values([...tickets])
                  .onConflictDoUpdate({
                    target: [ticketIndex.projectId, ticketIndex.ticketId],
                    set: excludedTicketIndexColumns(tickets[0]),
                    setWhere: or(
                      drizzleSql`${ticketIndex.updatedAt} <= excluded.updated_at`,
                      ...aheadOfDisk.map((ref) =>
                        and(
                          eq(ticketIndex.ticketId, ref.ticketId),
                          eq(ticketIndex.updatedAt, ref.updatedAt)
                        )
                      )
                    )
                  })
                  .returning({ ticketId: ticketIndex.ticketId })
          const writtenIds = new Set(written.map((row) => row.ticketId))
          const touchedIds = [...removed, ...written].map((row) => row.ticketId)
          if (writtenIds.size > 0) {
            yield* db
              .delete(ticketBranch)
              .where(
                and(
                  eq(ticketBranch.projectId, project.projectId),
                  inArray(ticketBranch.ticketId, [...writtenIds])
                )
              )
            const branches = documents
              .filter((document) => writtenIds.has(document.id))
              .flatMap((document) => ticketBranchRowsFor(project, document))
            if (branches.length > 0) {
              yield* db.insert(ticketBranch).values(branches)
            }
          }
          if (touchedIds.length > 0) {
            yield* db
              .delete(commentIndex)
              .where(
                and(
                  eq(commentIndex.projectId, project.projectId),
                  inArray(commentIndex.ticketId, touchedIds)
                )
              )
          }
          const writtenComments = comments.filter((comment) =>
            writtenIds.has(comment.ticketId)
          )
          if (writtenComments.length > 0) {
            yield* db.insert(commentIndex).values(writtenComments)
          }
          yield* db
            .update(projectIndex)
            .set({
              nextTicketNumber: drizzleSql`greatest(${projectIndex.nextTicketNumber}, ${nextTicketNumberFor(documents)})`
            })
            .where(eq(projectIndex.id, project.projectId))
            .pipe(Effect.asVoid, Effect.orDie)
        })
      )
      .pipe(Effect.orDie, Effect.asVoid)
  }

  const indexedRefs = (project: TicketProject) =>
    db
      .select({
        ticketId: ticketIndex.ticketId,
        updatedAt: ticketIndex.updatedAt
      })
      .from(ticketIndex)
      .where(eq(ticketIndex.projectId, project.projectId))
      .pipe(Effect.orDie)

  const listProjects = db
    .select({
      orgSlug: organization.slug,
      organizationId: projectIndex.organizationId,
      projectId: projectIndex.id,
      slug: projectIndex.slug
    })
    .from(projectIndex)
    .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
    .where(publishedProject())
    .pipe(Effect.orDie)

  const rebuildProject = Effect.fn("TicketIndexMaintenance.rebuildProject")(
    function* (project: TicketProject) {
      const indexedBefore = yield* indexedRefs(project)
      const { documents, skipped } = yield* collectDocuments(project)
      yield* writeProjectIndex(project, documents, indexedBefore)
      return { project, indexed: documents.length, skipped }
    }
  )

  const rebuildAllProjects = Effect.fn(
    "TicketIndexMaintenance.rebuildAllProjects"
  )(function* () {
    const projects = yield* listProjects
    const summaries = yield* Effect.forEach(
      projects,
      (project) => rebuildProject(project),
      { concurrency: 1 }
    )
    return { projects: summaries }
  })

  const reconciler = makeTicketIndexReconciler({
    listProjects,
    collectDocuments,
    indexedRefs,
    writeProject: writeProjectIndex
  })

  const repairBackoff = new Map<
    string,
    Readonly<{ failures: number; retryAt: number }>
  >()
  const repairUnpublished = Effect.gen(function* () {
    const queued = yield* repairs.pending
    if (queued.length === 0) return
    const now = yield* Clock.currentTimeMillis
    const pending = queued.filter(
      (project) => (repairBackoff.get(project.projectId)?.retryAt ?? 0) <= now
    )
    yield* repairs.remove(pending)
    yield* Effect.forEach(
      pending,
      (project) =>
        reconciler.reconcileProject(project).pipe(
          Effect.flatMap((summary) =>
            Effect.logInfo("repaired drifted ticket index", {
              orgSlug: project.orgSlug,
              slug: project.slug,
              rebuilt: summary.rebuilt
            })
          ),
          Effect.tap(() =>
            Effect.sync(() => repairBackoff.delete(project.projectId))
          ),
          Effect.catchCause((cause) =>
            Clock.currentTimeMillis.pipe(
              Effect.map((now) => {
                const failures =
                  (repairBackoff.get(project.projectId)?.failures ?? 0) + 1
                const delay = Math.min(
                  REPAIR_BACKOFF_MAX_MS,
                  REPAIR_BACKOFF_BASE_MS * 2 ** (failures - 1)
                )
                repairBackoff.set(project.projectId, {
                  failures,
                  retryAt: now + delay
                })
                return delay
              }),
              Effect.tap(() => repairs.markUnpublished(project)),
              Effect.flatMap((delay) =>
                Effect.logError(
                  "ticket index repair failed; requeued",
                  cause
                ).pipe(Effect.annotateLogs({ retryInMs: delay }))
              )
            )
          )
        ),
      { concurrency: 1 }
    )
  })

  yield* Effect.forkScoped(
    repairUnpublished.pipe(
      Effect.delay(TICKET_INDEX_REPAIR_INTERVAL),
      Effect.forever
    )
  )

  const reconcileProject = Effect.fn("TicketIndexMaintenance.reconcileProject")(
    function* (project: TicketProject, options?: TicketIndexReconcileOptions) {
      return yield* reconciler.reconcileProject(project, options)
    }
  )

  const reconcileAllProjects = Effect.fn(
    "TicketIndexMaintenance.reconcileAllProjects"
  )(function* () {
    return yield* reconciler.reconcileAllProjects()
  })

  return TicketIndexMaintenance.of({
    rebuildProject,
    rebuildAllProjects,
    reconcileProject,
    reconcileAllProjects
  })
})

export const layer = Layer.effect(TicketIndexMaintenance, make)
