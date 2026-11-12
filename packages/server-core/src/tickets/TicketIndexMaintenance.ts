import { Db } from "@pp/db"
import { jsonRecordset } from "@pp/db/jsonRecordset"
import { publishedProject } from "@pp/db/projectVisibility"
import {
  commentIndex,
  organization,
  projectIndex,
  ticketBranch,
  ticketRelationIndex,
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
import type * as Markdown from "../markdown/Markdown"
import * as TicketDocs from "./TicketDocs"
import * as TicketIndex from "./TicketIndex"
import * as TicketIndexRepairs from "./TicketIndexRepairs"
import type { TicketProject } from "./ticketProject"

export const ticketIndexRowsFor = (
  project: TicketProject,
  documents: ReadonlyArray<TicketDocs.TicketDocument>
): ReadonlyArray<typeof ticketIndex.$inferInsert> =>
  documents.map((document) => TicketIndex.ticketIndexRowFor(project, document))

const commentIndexRowsForDocument = (
  project: TicketProject,
  document: TicketDocs.TicketDocument
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
  documents: ReadonlyArray<TicketDocs.TicketDocument>
): ReadonlyArray<typeof commentIndex.$inferInsert> =>
  documents.flatMap((document) =>
    commentIndexRowsForDocument(project, document)
  )

export const nextTicketNumberFor = (
  documents: ReadonlyArray<TicketDocs.TicketDocument>
): number =>
  documents
    .flatMap((document) => [
      document.id,
      ...(document.blockedBy ?? []),
      ...(document.relatedTo ?? []),
      ...(document.duplicateOf === undefined ? [] : [document.duplicateOf])
    ])
    .reduce((next, id) => {
      const dash = id.lastIndexOf("-")
      const number = Number(id.slice(dash + 1))
      return Number.isSafeInteger(number) ? Math.max(next, number + 1) : next
    }, 1)

export type IndexedTicketRef = Readonly<
  Pick<typeof ticketIndex.$inferSelect, "ticketId" | "updatedAt" | "repoId">
>

export type DocumentTicketRef = Readonly<
  Pick<TicketDocs.TicketDocument, "updatedAt" | "repo"> & { id: string }
>

export const detectTicketIndexDrift = (
  indexed: ReadonlyArray<IndexedTicketRef>,
  documents: ReadonlyArray<DocumentTicketRef>
): TicketIndex.TicketIndexDrift => {
  const indexedById = new Map(indexed.map((row) => [row.ticketId, row]))
  const documentsById = new Map(documents.map((doc) => [doc.id, doc]))
  const missing: Array<string> = []
  const stale: Array<string> = []
  for (const [id, document] of documentsById) {
    const row = indexedById.get(id)
    if (row === undefined) missing.push(id)
    else if (
      row.updatedAt.getTime() !== document.updatedAt.getTime() ||
      row.repoId !== (document.repo ?? null)
    )
      stale.push(id)
  }
  const orphaned: Array<string> = []
  for (const id of indexedById.keys()) {
    if (!documentsById.has(id)) orphaned.push(id)
  }
  return {
    missing: missing.sort(),
    orphaned: orphaned.sort(),
    stale: stale.sort()
  }
}

export const ticketIndexHasDrift = (
  drift: TicketIndex.TicketIndexDrift
): boolean =>
  drift.missing.length > 0 ||
  drift.orphaned.length > 0 ||
  drift.stale.length > 0

export interface TicketIndexReconcilerDeps {
  readonly listProjects: Effect.Effect<ReadonlyArray<TicketProject>>
  readonly collectDocuments: (
    project: TicketProject
  ) => Effect.Effect<
    { documents: ReadonlyArray<TicketDocs.TicketDocument>; skipped: number },
    Markdown.MarkdownError
  >
  readonly indexedRefs: (
    project: TicketProject
  ) => Effect.Effect<ReadonlyArray<IndexedTicketRef>>
  readonly writeProject: (
    project: TicketProject,
    documents: ReadonlyArray<TicketDocs.TicketDocument>,
    indexedBefore: ReadonlyArray<IndexedTicketRef>
  ) => Effect.Effect<void>
}

export const makeTicketIndexReconciler = (deps: TicketIndexReconcilerDeps) => {
  const reconcileProject = (
    project: TicketProject,
    options?: TicketIndex.TicketIndexReconcileOptions
  ): Effect.Effect<
    TicketIndex.TicketIndexReconcileProjectSummary,
    Markdown.MarkdownError
  > =>
    Effect.gen(function* () {
      const indexedBefore = yield* deps.indexedRefs(project)
      const { documents, skipped } = yield* deps.collectDocuments(project)
      const indexed = yield* deps.indexedRefs(project)
      const drift = detectTicketIndexDrift(indexed, documents)
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
    TicketIndex.TicketIndexReconcileSummary,
    Markdown.MarkdownError
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
      TicketIndex.TicketIndexRebuildProjectSummary,
      Markdown.MarkdownError | TicketDocs.MalformedTicketDocument
    >
    rebuildAllProjects: () => Effect.Effect<
      TicketIndex.TicketIndexRebuildSummary,
      Markdown.MarkdownError | TicketDocs.MalformedTicketDocument
    >
    reconcileProject: (
      project: TicketProject,
      options?: TicketIndex.TicketIndexReconcileOptions
    ) => Effect.Effect<
      TicketIndex.TicketIndexReconcileProjectSummary,
      Markdown.MarkdownError | TicketDocs.MalformedTicketDocument
    >
    reconcileAllProjects: () => Effect.Effect<
      TicketIndex.TicketIndexReconcileSummary,
      Markdown.MarkdownError | TicketDocs.MalformedTicketDocument
    >
  }>
>()("@pp/server-core/tickets/TicketIndexMaintenance") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const sql = yield* SqlClient.SqlClient
  const ticketDocs = yield* TicketDocs.TicketDocs
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
    documents: ReadonlyArray<TicketDocs.TicketDocument>,
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
          const missingSet = jsonRecordset(ticketIndex, "missing", missing)
          const removed = yield* db
            .delete(ticketIndex)
            .where(
              and(
                eq(ticketIndex.projectId, project.projectId),
                drizzleSql`(${ticketIndex.ticketId}, ${ticketIndex.updatedAt}) in (select ${missingSet.rows.ticketId}, ${missingSet.rows.updatedAt} from ${missingSet.from})`
              )
            )
            .returning({ ticketId: ticketIndex.ticketId })
          const ticketSet = jsonRecordset(ticketIndex, "tickets", tickets)
          const aheadSet = jsonRecordset(ticketIndex, "ahead", aheadOfDisk)
          const written =
            tickets.length === 0
              ? []
              : yield* db
                  .insert(ticketIndex)
                  .select(() => ticketSet.select)
                  .onConflictDoUpdate({
                    target: [ticketIndex.projectId, ticketIndex.ticketId],
                    set: excludedTicketIndexColumns(tickets[0]),
                    setWhere: or(
                      drizzleSql`${ticketIndex.updatedAt} <= excluded.updated_at`,
                      drizzleSql`(${ticketIndex.ticketId}, ${ticketIndex.updatedAt}) in (select ${aheadSet.rows.ticketId}, ${aheadSet.rows.updatedAt} from ${aheadSet.from})`
                    )
                  })
                  .returning({ ticketId: ticketIndex.ticketId })
          const writtenIds = new Set(written.map((row) => row.ticketId))
          const touchedIds = [...removed, ...written].map((row) => row.ticketId)
          const writtenSet = jsonRecordset(
            ticketIndex,
            "written",
            [...writtenIds].map((ticketId) => ({ ticketId }))
          )
          yield* db
            .delete(ticketBranch)
            .where(
              and(
                eq(ticketBranch.projectId, project.projectId),
                drizzleSql`${ticketBranch.ticketId} in (select ${writtenSet.rows.ticketId} from ${writtenSet.from})`
              )
            )
          const branchSet = jsonRecordset(
            ticketBranch,
            "branches",
            documents
              .filter((document) => writtenIds.has(document.id))
              .flatMap((document) =>
                TicketIndex.ticketBranchRowsFor(project, document)
              )
          )
          yield* db.insert(ticketBranch).select(() => branchSet.select)
          yield* db
            .delete(ticketRelationIndex)
            .where(
              and(
                eq(ticketRelationIndex.projectId, project.projectId),
                drizzleSql`${ticketRelationIndex.fromTicketId} in (select ${writtenSet.rows.ticketId} from ${writtenSet.from})`
              )
            )
          const relationSet = jsonRecordset(
            ticketRelationIndex,
            "relations",
            documents
              .filter((document) => writtenIds.has(document.id))
              .flatMap((document) =>
                TicketIndex.ticketRelationRowsFor(project, document)
              )
          )
          yield* db.insert(ticketRelationIndex).select(() => relationSet.select)
          const touchedSet = jsonRecordset(
            ticketIndex,
            "touched",
            touchedIds.map((ticketId) => ({ ticketId }))
          )
          yield* db
            .delete(commentIndex)
            .where(
              and(
                eq(commentIndex.projectId, project.projectId),
                drizzleSql`${commentIndex.ticketId} in (select ${touchedSet.rows.ticketId} from ${touchedSet.from})`
              )
            )
          const commentSet = jsonRecordset(
            commentIndex,
            "comments",
            comments.filter((comment) => writtenIds.has(comment.ticketId))
          )
          yield* db.insert(commentIndex).select(() => commentSet.select)
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
        updatedAt: ticketIndex.updatedAt,
        repoId: ticketIndex.repoId
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
    function* (
      project: TicketProject,
      options?: TicketIndex.TicketIndexReconcileOptions
    ) {
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
