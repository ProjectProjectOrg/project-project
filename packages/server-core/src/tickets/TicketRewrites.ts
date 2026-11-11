import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { commentIndex, organization, projectIndex } from "@pp/db/schema"
import { TagName, TicketStatus, type ActivityActor } from "@pp/shared"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import {
  parseCommentsRegion,
  serializeCommentsRegion
} from "../comments/comments-region"
import type * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketIndex from "./TicketIndex"
import type { TicketReadError } from "./ticketPresentation"

const makeTagName = Schema.decodeUnknownSync(TagName)

export type JiraIdentityClaim = Readonly<{
  userId: string
  jiraAccountIds: ReadonlyArray<string>
  assigneeTicketIds: ReadonlyArray<string>
  reporterTicketIds: ReadonlyArray<string>
}>

export class TicketRewrites extends Context.Service<
  TicketRewrites,
  Readonly<{
    renameTag: (
      orgSlug: string,
      slug: string,
      oldName: string,
      newName: string | null
    ) => Effect.Effect<void, Markdown.MarkdownError, ActivityActor>
    moveToStatus: (
      orgSlug: string,
      slug: string,
      ids: ReadonlyArray<string>,
      newStatus: string,
      reason: "renamed" | "removed"
    ) => Effect.Effect<void, Markdown.MarkdownError, ActivityActor>
    unassignUserFromActiveTickets: (
      orgSlug: string,
      slug: string,
      userId: string
    ) => Effect.Effect<void, never, ActivityActor>
    unassignUserFromOrgTickets: (
      orgSlug: string,
      userId: string
    ) => Effect.Effect<void, never, ActivityActor>
    claimJiraIdentity: (
      orgSlug: string,
      slug: string,
      claim: JiraIdentityClaim
    ) => Effect.Effect<ReadonlyArray<string>, never, ActivityActor>
    stampRepository: (
      orgSlug: string,
      slug: string,
      repoId: string
    ) => Effect.Effect<void, Markdown.MarkdownError, ActivityActor>
  }>
>()("@pp/server-core/tickets/TicketRewrites") {}

const make = Effect.gen(function* () {
  const db = yield* Db
  const ticketDocs = yield* TicketDocs.TicketDocs
  const ticketIndex = yield* TicketIndex.TicketIndex
  const ticketDocumentLock = yield* TicketDocumentLock.TicketDocumentLock
  const finishedStatuses = yield* FinishedStatuses

  const rewrite = (
    orgSlug: string,
    slug: string,
    id: string,
    change: (
      existing: TicketDocs.TicketDocument
    ) => Effect.Effect<TicketDocs.TicketDocument> | null,
    activity: TicketDocs.TicketActivityOptions
  ): Effect.Effect<boolean, TicketReadError, ActivityActor> =>
    ticketDocumentLock.withTicketDocumentLock(
      orgSlug,
      slug,
      id,
      Effect.gen(function* () {
        const indexProject = yield* ticketIndex.projectFor(orgSlug, slug)
        let replaced = false
        yield* ticketDocs.update(
          orgSlug,
          slug,
          id,
          (existing) => {
            const next = change(existing)
            if (next === null) return Effect.succeed(existing)
            replaced = true
            return next
          },
          (next) =>
            replaced
              ? ticketIndex.upsertTicket(indexProject, next)
              : Effect.void,
          activity
        )
        return replaced
      })
    )

  const replaceTag = Effect.fn("TicketRewrites.replaceTag")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    oldName: string,
    newName: string | null
  ): Effect.fn.Return<boolean, TicketReadError, ActivityActor> {
    return yield* rewrite(
      orgSlug,
      slug,
      id,
      (existing) => {
        if (!existing.tags.some((tag) => tag === oldName)) return null
        const tags =
          newName === null
            ? existing.tags.filter((tag) => tag !== oldName)
            : existing.tags.map((tag) =>
                tag === oldName ? makeTagName(newName) : tag
              )
        return DateTime.nowAsDate.pipe(
          Effect.map((updatedAt) => ({ ...existing, tags, updatedAt }))
        )
      },
      newName === null ? { cause: "tag_deleted" } : { silent: true }
    )
  })

  const replaceStatus = Effect.fn("TicketRewrites.replaceStatus")(function* (
    orgSlug: string,
    slug: string,
    id: string,
    newStatus: string,
    reason: "renamed" | "removed"
  ): Effect.fn.Return<boolean, TicketReadError, ActivityActor> {
    return yield* rewrite(
      orgSlug,
      slug,
      id,
      (existing) =>
        existing.status === newStatus
          ? null
          : DateTime.nowAsDate.pipe(
              Effect.map((updatedAt) => ({
                ...existing,
                status: TicketStatus.make(newStatus),
                updatedAt
              }))
            ),
      reason === "renamed" ? { silent: true } : { cause: "status_removed" }
    )
  })

  const skipUnreadable = (
    effect: Effect.Effect<boolean, TicketReadError, ActivityActor>
  ) =>
    effect.pipe(
      Effect.catchTags({
        NotFound: () => Effect.succeed(false),
        MalformedTicketDocument: () => Effect.succeed(false)
      })
    )

  const renameTag = Effect.fn("TicketRewrites.renameTag")(function* (
    orgSlug: string,
    slug: string,
    oldName: string,
    newName: string | null
  ) {
    const project = yield* ticketIndex
      .projectFor(orgSlug, slug)
      .pipe(Effect.orDie)
    const ids = yield* ticketIndex.findTicketIdsByTag(project, oldName)
    yield* Effect.forEach(
      ids,
      (id) => skipUnreadable(replaceTag(orgSlug, slug, id, oldName, newName)),
      { concurrency: 8, discard: true }
    )
  })

  const moveToStatus = Effect.fn("TicketRewrites.moveToStatus")(function* (
    orgSlug: string,
    slug: string,
    ids: ReadonlyArray<string>,
    newStatus: string,
    reason: "renamed" | "removed"
  ) {
    yield* Effect.forEach(
      ids,
      (id) =>
        skipUnreadable(replaceStatus(orgSlug, slug, id, newStatus, reason)),
      { concurrency: 8, discard: true }
    )
  })

  const unassignUserFromActiveTickets = Effect.fn(
    "TicketRewrites.unassignUserFromActiveTickets"
  )(function* (orgSlug: string, slug: string, userId: string) {
    const [project, ids, finished] = yield* Effect.all(
      [
        ticketIndex.projectFor(orgSlug, slug).pipe(Effect.orDie),
        ticketDocs.listIds(orgSlug, slug).pipe(Effect.orDie),
        finishedStatuses.forProject(orgSlug, slug)
      ],
      { concurrency: "unbounded" }
    )
    yield* Effect.forEach(
      ids,
      (id) =>
        ticketDocs
          .update(
            orgSlug,
            slug,
            id,
            (ticket) => {
              if (
                finished.has(ticket.status) ||
                !ticket.assignees.includes(userId)
              ) {
                return Effect.succeed(ticket)
              }
              return DateTime.nowAsDate.pipe(
                Effect.map((updatedAt) => ({
                  ...ticket,
                  assignees: ticket.assignees.filter((id) => id !== userId),
                  updatedAt
                }))
              )
            },
            (next) => ticketIndex.upsertTicket(project, next),
            { cause: "member_removed" }
          )
          .pipe(
            Effect.catchTag("NotFound", () => Effect.succeed(null)),
            Effect.catchTags({
              MalformedTicketDocument: (error) =>
                Effect.logWarning("unassign skipped a malformed ticket", {
                  ticketId: id,
                  error
                }),
              MarkdownError: (error) =>
                Effect.logWarning("unassign could not write a ticket", {
                  ticketId: id,
                  error
                })
            })
          ),
      { concurrency: 8, discard: true }
    )
  })

  const unassignUserFromOrgTickets = Effect.fn(
    "TicketRewrites.unassignUserFromOrgTickets"
  )(function* (orgSlug: string, userId: string) {
    const projects = yield* db
      .select({ slug: projectIndex.slug })
      .from(projectIndex)
      .innerJoin(organization, eq(organization.id, projectIndex.organizationId))
      .where(and(eq(organization.slug, orgSlug), publishedProject()))
      .pipe(Effect.orDie)
    yield* Effect.forEach(
      projects,
      (project) => unassignUserFromActiveTickets(orgSlug, project.slug, userId),
      { concurrency: 4, discard: true }
    )
  })

  const claimJiraIdentity = Effect.fn("TicketRewrites.claimJiraIdentity")(
    function* (orgSlug: string, slug: string, claim: JiraIdentityClaim) {
      const project = yield* ticketIndex
        .projectFor(orgSlug, slug)
        .pipe(Effect.orDie)
      const accounts = new Set(claim.jiraAccountIds)
      const assigned = new Set(claim.assigneeTicketIds)
      const reported = new Set(claim.reporterTicketIds)
      const commented =
        accounts.size === 0
          ? []
          : yield* db
              .selectDistinct({ ticketId: commentIndex.ticketId })
              .from(commentIndex)
              .where(
                and(
                  eq(commentIndex.projectId, project.projectId),
                  inArray(commentIndex.jiraAccountId, [...accounts])
                )
              )
              .pipe(Effect.orDie)
      const ticketIds = new Set([
        ...assigned,
        ...reported,
        ...commented.map((row) => row.ticketId)
      ])
      const failed: Array<string> = []
      yield* Effect.forEach(
        ticketIds,
        (id) =>
          rewrite(
            orgSlug,
            slug,
            id,
            (existing) => {
              const blocks = parseCommentsRegion(existing.commentsRegion)
              const claimedBlocks = blocks.map((block) =>
                block.author.kind === "jira" &&
                accounts.has(block.author.accountId)
                  ? {
                      ...block,
                      author: { kind: "user" as const, userId: claim.userId }
                    }
                  : block
              )
              const commentsChanged = claimedBlocks.some(
                (block, index) => block !== blocks[index]
              )
              const assign =
                assigned.has(id) && !existing.assignees.includes(claim.userId)
              const report =
                reported.has(id) && existing.createdBy !== claim.userId
              if (!commentsChanged && !assign && !report) return null
              return Effect.succeed({
                ...existing,
                assignees: assign
                  ? [...existing.assignees, claim.userId]
                  : existing.assignees,
                createdBy: report ? claim.userId : existing.createdBy,
                commentsRegion: commentsChanged
                  ? serializeCommentsRegion(claimedBlocks)
                  : existing.commentsRegion
              })
            },
            { silent: true }
          ).pipe(
            Effect.catchTags({
              NotFound: () => Effect.succeed(false),
              MalformedTicketDocument: (error) =>
                Effect.logWarning("jira claim skipped a malformed ticket", {
                  ticketId: id,
                  error
                }).pipe(
                  Effect.andThen(Effect.sync(() => failed.push(id))),
                  Effect.as(false)
                ),
              MarkdownError: (error) =>
                Effect.logWarning("jira claim could not write a ticket", {
                  ticketId: id,
                  error
                }).pipe(
                  Effect.andThen(Effect.sync(() => failed.push(id))),
                  Effect.as(false)
                )
            })
          ),
        { concurrency: 8, discard: true }
      )
      if (accounts.size === 0) return failed
      yield* db
        .update(commentIndex)
        .set({
          authorKind: "user",
          authorId: claim.userId,
          jiraDisplayName: null,
          jiraAccountId: null
        })
        .where(
          and(
            eq(commentIndex.projectId, project.projectId),
            inArray(commentIndex.jiraAccountId, [...accounts]),
            failed.length === 0
              ? undefined
              : notInArray(commentIndex.ticketId, failed)
          )
        )
        .pipe(Effect.orDie)
      return failed
    }
  )

  const stampRepository = Effect.fn("TicketRewrites.stampRepository")(
    function* (orgSlug: string, slug: string, repoId: string) {
      const ids = yield* ticketDocs.listIds(orgSlug, slug)
      yield* Effect.forEach(
        ids,
        (id) =>
          rewrite(
            orgSlug,
            slug,
            id,
            (existing) =>
              existing.branch === null || existing.repo !== undefined
                ? null
                : Effect.succeed({ ...existing, repo: repoId }),
            { silent: true }
          ).pipe(
            Effect.catchTags({
              NotFound: () => Effect.succeed(false),
              MalformedTicketDocument: (error) =>
                Effect.logWarning("Skipping unreadable ticket repository").pipe(
                  Effect.annotateLogs({ orgSlug, slug, ticketId: id, error }),
                  Effect.as(false)
                )
            })
          ),
        { discard: true }
      )
    }
  )

  return TicketRewrites.of({
    renameTag,
    moveToStatus,
    unassignUserFromActiveTickets,
    unassignUserFromOrgTickets,
    claimJiraIdentity,
    stampRepository
  })
})

export const layer = Layer.effect(TicketRewrites, make)
