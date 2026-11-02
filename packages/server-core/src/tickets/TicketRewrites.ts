import { Db } from "@pp/db"
import { publishedProject } from "@pp/db/projectVisibility"
import { organization, projectIndex } from "@pp/db/schema"
import { TagName, TicketStatus, type ActivityActor } from "@pp/shared"
import { and, eq } from "drizzle-orm"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type * as Markdown from "../markdown/Markdown"
import { FinishedStatuses } from "../projects/FinishedStatuses"
import * as TicketDocs from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import * as TicketIndex from "./TicketIndex"
import type { TicketReadError } from "./ticketPresentation"
import {
  clearedPrMetadata,
  hasPrMetadata,
  prMetadataOf
} from "./ticketPrMetadata"

const makeTagName = Schema.decodeUnknownSync(TagName)

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
    withClearedPrMetadata: <A, E, R>(
      orgSlug: string,
      slug: string,
      switchRepository: Effect.Effect<A, E, R>
    ) => Effect.Effect<A, E | Markdown.MarkdownError, R | ActivityActor>
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

  const withClearedPrMetadata = <A, E, R>(
    orgSlug: string,
    slug: string,
    switchRepository: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E | Markdown.MarkdownError, R | ActivityActor> =>
    Effect.gen(function* () {
      const project = yield* ticketIndex
        .projectFor(orgSlug, slug)
        .pipe(Effect.orDie)
      const ids = yield* ticketDocs.listIds(orgSlug, slug)
      const originals: Array<TicketDocs.TicketDocument> = []
      const clearAndSwitch = Effect.gen(function* () {
        for (const id of ids) {
          const ticket = yield* ticketDocs.read(orgSlug, slug, id).pipe(
            Effect.catchTags({
              NotFound: () => Effect.succeed(null),
              MalformedTicketDocument: (error) =>
                Effect.logWarning(
                  "Skipping unreadable ticket pr metadata"
                ).pipe(
                  Effect.annotateLogs({ orgSlug, slug, ticketId: id, error }),
                  Effect.as(null)
                )
            })
          )
          if (ticket === null || !hasPrMetadata(ticket)) {
            continue
          }
          const next = {
            ...clearedPrMetadata(ticket),
            updatedAt: yield* DateTime.nowAsDate
          }
          yield* ticketDocs
            .update(
              orgSlug,
              slug,
              id,
              (current) =>
                Effect.succeed({
                  ...current,
                  ...prMetadataOf(next),
                  updatedAt: next.updatedAt
                }),
              (updated) =>
                Effect.gen(function* () {
                  originals.push(ticket)
                  yield* ticketIndex.upsertTicket(project, updated)
                }),
              { silent: true }
            )
            .pipe(
              Effect.catchTags({
                NotFound: () => Effect.void,
                MalformedTicketDocument: (error) =>
                  Effect.logWarning("Skipping unreadable ticket pr metadata", {
                    orgSlug,
                    slug,
                    ticketId: id,
                    error
                  })
              })
            )
        }
        return yield* switchRepository
      }).pipe(
        Effect.onError(() =>
          Effect.forEach(
            originals,
            (ticket) =>
              ticketDocs.update(
                orgSlug,
                slug,
                ticket.id,
                (current) =>
                  Effect.succeed({
                    ...current,
                    ...prMetadataOf(ticket),
                    updatedAt: ticket.updatedAt
                  }),
                (restored) => ticketIndex.upsertTicket(project, restored),
                { silent: true }
              ),
            { discard: true }
          ).pipe(Effect.orDie)
        ),
        Effect.uninterruptible
      )
      return yield* ids
        .toSorted()
        .reduceRight(
          (effect, id) =>
            ticketDocumentLock.withTicketDocumentLock(
              orgSlug,
              slug,
              id,
              effect
            ),
          clearAndSwitch
        )
    }).pipe(Effect.withSpan("TicketRewrites.withClearedPrMetadata"))

  return TicketRewrites.of({
    renameTag,
    moveToStatus,
    unassignUserFromActiveTickets,
    unassignUserFromOrgTickets,
    withClearedPrMetadata
  })
})

export const layer = Layer.effect(TicketRewrites, make)
