import { TagName, TicketStatus, type ActivityActor } from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"

import type { MarkdownError } from "../markdown/Markdown"
import {
  TicketDocs,
  type TicketActivityOptions,
  type TicketDocument
} from "./TicketDocs"
import * as TicketDocumentLock from "./ticketDocumentLock"
import { TicketIndex } from "./TicketIndex"
import type { TicketReadError } from "./ticketPresentation"

const makeTagName = Schema.decodeUnknownSync(TagName)

export class TicketRewrites extends Context.Service<
  TicketRewrites,
  Readonly<{
    renameTag: (
      orgSlug: string,
      slug: string,
      oldName: string,
      newName: string | null
    ) => Effect.Effect<void, MarkdownError, ActivityActor>
    moveToStatus: (
      orgSlug: string,
      slug: string,
      ids: ReadonlyArray<string>,
      newStatus: string,
      reason: "renamed" | "removed"
    ) => Effect.Effect<void, MarkdownError, ActivityActor>
  }>
>()("@pp/server-core/tickets/TicketRewrites") {}

const make = Effect.gen(function* () {
  const ticketDocs = yield* TicketDocs
  const ticketIndex = yield* TicketIndex
  const ticketDocumentLock = yield* TicketDocumentLock.TicketDocumentLock

  const rewrite = (
    orgSlug: string,
    slug: string,
    id: string,
    change: (existing: TicketDocument) => Effect.Effect<TicketDocument> | null,
    activity: TicketActivityOptions
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
    for (const id of ids) {
      yield* skipUnreadable(replaceTag(orgSlug, slug, id, oldName, newName))
    }
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

  return TicketRewrites.of({ renameTag, moveToStatus })
})

export const layer = Layer.effect(TicketRewrites, make)
