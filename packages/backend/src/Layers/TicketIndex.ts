import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as SqlClient from "@effect/sql/SqlClient"
import { and, eq, inArray } from "drizzle-orm"
import {
  NotFound,
  TagName,
  TicketId,
  type PullRequestState,
  type TicketPriority,
  type TicketStatus,
  type TicketType
} from "@projectproject/shared"
import { organization, projectIndex, ticketIndex } from "../db/schema"
import { Db } from "../Services/Db"
import {
  TicketIndex,
  type TicketIndexEntry,
  type TicketIndexProject
} from "../Services/TicketIndex"
import { TicketDocs, type TicketDocument } from "../Services/TicketDocs"

const makeTicketId = Schema.decodeUnknownSync(TicketId)
const makeTagName = Schema.decodeUnknownSync(TagName)

export const TicketIndexLive = Layer.effect(
  TicketIndex,
  Effect.gen(function* () {
    const db = yield* Db
    const sql = yield* SqlClient.SqlClient
    const ticketDocs = yield* TicketDocs

    const projectFor = (
      orgSlug: string,
      slug: string
    ): Effect.Effect<TicketIndexProject, NotFound> =>
      Effect.gen(function* () {
        const rows = yield* db
          .select({
            orgSlug: organization.slug,
            organizationId: projectIndex.organizationId,
            projectId: projectIndex.id,
            projectSlug: projectIndex.slug
          })
          .from(projectIndex)
          .innerJoin(
            organization,
            eq(organization.id, projectIndex.organizationId)
          )
          .where(
            and(eq(organization.slug, orgSlug), eq(projectIndex.slug, slug))
          )
          .limit(1)
          .pipe(Effect.orDie)
        const row = rows[0]
        return row ?? (yield* new NotFound())
      })

    const rowFor = (project: TicketIndexProject, document: TicketDocument) => ({
      organizationId: project.organizationId,
      orgSlug: project.orgSlug,
      projectId: project.projectId,
      projectSlug: project.projectSlug,
      ticketId: document.id,
      title: document.title,
      status: document.status,
      type: document.type,
      priority: document.priority,
      tags: [...document.tags],
      assignees: [...document.assignees],
      branch: document.branch,
      pr: document.pr,
      prState: document.prState,
      lastTransitionedPr: document.lastTransitionedPr,
      createdBy: document.createdBy,
      createdAt: document.createdAt,
      updatedAt: document.updatedAt
    })

    const toEntry = (
      row: typeof ticketIndex.$inferSelect
    ): TicketIndexEntry => ({
      id: makeTicketId(row.ticketId),
      title: row.title,
      status: row.status as TicketStatus,
      type: row.type as TicketType,
      priority: row.priority as TicketPriority,
      tags: row.tags.map((tag) => makeTagName(tag)),
      branch: row.branch,
      pr: row.pr,
      prState: row.prState as PullRequestState | null,
      lastTransitionedPr: row.lastTransitionedPr,
      assignees: row.assignees,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt
    })

    const list = (
      project: TicketIndexProject,
      ticketIds?: ReadonlyArray<string>
    ): Effect.Effect<ReadonlyArray<TicketIndexEntry>> => {
      if (ticketIds !== undefined && ticketIds.length === 0) {
        return Effect.succeed([])
      }
      const where =
        ticketIds === undefined
          ? eq(ticketIndex.projectId, project.projectId)
          : and(
              eq(ticketIndex.projectId, project.projectId),
              inArray(ticketIndex.ticketId, [...ticketIds])
            )
      return db
        .select()
        .from(ticketIndex)
        .where(where)
        .pipe(
          Effect.map((rows) => rows.map(toEntry)),
          Effect.orDie
        )
    }

    const listIds = (
      project: TicketIndexProject
    ): Effect.Effect<ReadonlyArray<string>> =>
      db
        .select({ ticketId: ticketIndex.ticketId })
        .from(ticketIndex)
        .where(eq(ticketIndex.projectId, project.projectId))
        .pipe(
          Effect.map((rows) => rows.map((row) => row.ticketId)),
          Effect.orDie
        )

    const tagUsageCounts = (
      project: TicketIndexProject
    ): Effect.Effect<Readonly<Record<string, number>>> =>
      db
        .select({ tags: ticketIndex.tags })
        .from(ticketIndex)
        .where(eq(ticketIndex.projectId, project.projectId))
        .pipe(
          Effect.map((rows) => {
            const counts: Record<string, number> = {}
            for (const row of rows) {
              for (const tag of row.tags) counts[tag] = (counts[tag] ?? 0) + 1
            }
            return counts
          }),
          Effect.orDie
        )

    const findTicketIdsByTag = (
      project: TicketIndexProject,
      tag: string
    ): Effect.Effect<ReadonlyArray<string>> =>
      db
        .select({ ticketId: ticketIndex.ticketId, tags: ticketIndex.tags })
        .from(ticketIndex)
        .where(eq(ticketIndex.projectId, project.projectId))
        .pipe(
          Effect.map((rows) =>
            rows
              .filter((row) => row.tags.includes(tag))
              .map((row) => row.ticketId)
          ),
          Effect.orDie
        )

    const findTicketIdsByStatus = (
      project: TicketIndexProject,
      status: string
    ): Effect.Effect<ReadonlyArray<string>> =>
      db
        .select({ ticketId: ticketIndex.ticketId })
        .from(ticketIndex)
        .where(
          and(
            eq(ticketIndex.projectId, project.projectId),
            eq(ticketIndex.status, status)
          )
        )
        .pipe(
          Effect.map((rows) => rows.map((r) => r.ticketId)),
          Effect.orDie
        )

    const findTicketsByBranch = (
      projectId: string,
      branch: string
    ): Effect.Effect<
      ReadonlyArray<{
        readonly orgSlug: string
        readonly organizationId: string
        readonly projectId: string
        readonly projectSlug: string
        readonly ticketId: string
        readonly branch: string
      }>
    > =>
      db
        .select({
          orgSlug: ticketIndex.orgSlug,
          organizationId: ticketIndex.organizationId,
          projectId: ticketIndex.projectId,
          projectSlug: ticketIndex.projectSlug,
          ticketId: ticketIndex.ticketId,
          branch: ticketIndex.branch
        })
        .from(ticketIndex)
        .where(
          and(
            eq(ticketIndex.projectId, projectId),
            eq(ticketIndex.branch, branch)
          )
        )
        .pipe(
          Effect.map((rows) =>
            rows.flatMap((row) =>
              row.branch === null ? [] : [{ ...row, branch: row.branch }]
            )
          ),
          Effect.orDie
        )

    const upsertTicket = (
      project: TicketIndexProject,
      document: TicketDocument
    ): Effect.Effect<void> =>
      db
        .insert(ticketIndex)
        .values(rowFor(project, document))
        .onConflictDoUpdate({
          target: [ticketIndex.projectId, ticketIndex.ticketId],
          set: rowFor(project, document)
        })
        .pipe(Effect.asVoid, Effect.orDie)

    const deleteTicket = (
      project: TicketIndexProject,
      ticketId: string
    ): Effect.Effect<void> =>
      db
        .delete(ticketIndex)
        .where(
          and(
            eq(ticketIndex.projectId, project.projectId),
            eq(ticketIndex.ticketId, ticketId)
          )
        )
        .pipe(Effect.asVoid, Effect.orDie)

    const rebuildProject = (project: TicketIndexProject) =>
      Effect.gen(function* () {
        const ids = yield* ticketDocs.listIds(
          project.orgSlug,
          project.projectSlug
        )
        const reads = yield* Effect.forEach(
          ids,
          (id) =>
            ticketDocs.read(project.orgSlug, project.projectSlug, id).pipe(
              Effect.map((ticket) => ({ ticket, skipped: false as const })),
              Effect.catchTag("MalformedTicketDocument", (error) =>
                Effect.logWarning(
                  "Skipping unreadable ticket for ticket index",
                  {
                    orgSlug: project.orgSlug,
                    slug: project.projectSlug,
                    ticketId: id,
                    error
                  }
                ).pipe(Effect.as({ ticket: null, skipped: true as const }))
              ),
              Effect.catchTag("NotFound", () =>
                Effect.logDebug("Skipping vanished ticket for ticket index", {
                  orgSlug: project.orgSlug,
                  slug: project.projectSlug,
                  ticketId: id
                }).pipe(Effect.as({ ticket: null, skipped: true as const }))
              )
            ),
          { concurrency: 8 }
        )
        const tickets = reads.flatMap((read) =>
          read.ticket === null ? [] : [read.ticket]
        )
        const skipped = reads.filter((read) => read.skipped).length
        yield* sql
          .withTransaction(
            Effect.gen(function* () {
              yield* db
                .delete(ticketIndex)
                .where(eq(ticketIndex.projectId, project.projectId))
                .pipe(Effect.asVoid, Effect.orDie)
              if (tickets.length > 0) {
                yield* db
                  .insert(ticketIndex)
                  .values(tickets.map((ticket) => rowFor(project, ticket)))
                  .pipe(Effect.asVoid, Effect.orDie)
              }
            })
          )
          .pipe(Effect.catchTag("SqlError", Effect.die))
        return { project, indexed: tickets.length, skipped }
      })

    const rebuildAllProjects = () =>
      Effect.gen(function* () {
        const projects = yield* db
          .select({
            orgSlug: organization.slug,
            organizationId: projectIndex.organizationId,
            projectId: projectIndex.id,
            projectSlug: projectIndex.slug
          })
          .from(projectIndex)
          .innerJoin(
            organization,
            eq(organization.id, projectIndex.organizationId)
          )
          .pipe(Effect.orDie)
        const summaries = yield* Effect.forEach(projects, rebuildProject, {
          concurrency: 1
        })
        return { projects: summaries }
      })

    return {
      projectFor,
      list,
      listIds,
      tagUsageCounts,
      findTicketIdsByTag,
      findTicketIdsByStatus,
      findTicketsByBranch,
      upsertTicket,
      deleteTicket,
      rebuildProject,
      rebuildAllProjects
    }
  })
)
