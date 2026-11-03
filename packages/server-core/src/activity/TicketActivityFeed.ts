import {
  decodeCursor,
  encodeCursor,
  ProjectScope,
  TICKET_ACTIVITY_PAGE_SIZE,
  Validation,
  type NotFound,
  type TicketActivityEntry,
  type TicketActivityPage,
  type User
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type * as Markdown from "../markdown/Markdown"
import * as TicketDocs from "../tickets/TicketDocs"
import * as Users from "../users/Users"
import { presentActor } from "./actorRow"
import { coalesceActivity } from "./coalesce"
import * as TicketActivity from "./TicketActivity"

export class TicketActivityFeed extends Context.Service<
  TicketActivityFeed,
  Readonly<{
    list: (
      ticketId: string,
      cursor: string | undefined
    ) => Effect.Effect<
      TicketActivityPage,
      | NotFound
      | Validation
      | Markdown.MarkdownError
      | TicketDocs.MalformedTicketDocument,
      ProjectScope
    >
  }>
>()("@pp/server-core/activity/TicketActivityFeed") {}

const parseCursor = (
  cursor: string | undefined
): Effect.Effect<TicketActivity.ActivityPageCursor | null, Validation> =>
  cursor === undefined
    ? Effect.succeed(null)
    : Effect.try({
        try: () => {
          const payload = decodeCursor(cursor)
          const seq = Number(payload.id)
          if (!Number.isSafeInteger(seq)) throw new Error("invalid seq")
          return {
            seq,
            occurredAt: DateTime.toDate(DateTime.makeUnsafe(payload.sort))
          }
        },
        catch: () => new Validation({ reason: "invalid_cursor" })
      })

const cursorOf = (entry: TicketActivity.StoredTicketActivity): string =>
  encodeCursor({
    id: String(entry.seq),
    sort: DateTime.formatIso(DateTime.fromDateUnsafe(entry.occurredAt))
  })

const make = Effect.gen(function* () {
  const activity = yield* TicketActivity.TicketActivity
  const ticketDocs = yield* TicketDocs.TicketDocs
  const users = yield* Users.Users

  const list = Effect.fn("TicketActivityFeed.list")(function* (
    ticketId: string,
    cursor: string | undefined
  ) {
    const scope = yield* ProjectScope
    const ticket = yield* ticketDocs.read(scope.orgSlug, scope.slug, ticketId)
    const before = yield* parseCursor(cursor)
    const rows = yield* activity.page(
      scope.projectId,
      ticket.id,
      before,
      TICKET_ACTIVITY_PAGE_SIZE + 1,
      scope.permissions.can({ github: ["read"] })
    )
    const hasMore = rows.length > TICKET_ACTIVITY_PAGE_SIZE
    const page = rows.slice(0, TICKET_ACTIVITY_PAGE_SIZE)
    const visible = coalesceActivity(page)
    const actorIds = visible.flatMap((entry) =>
      entry.actor.kind === "system" ? [] : [entry.actor.userId]
    )
    const mentionedIds = visible.flatMap((entry) =>
      entry.change.kind === "assignees_changed"
        ? [...entry.change.added, ...entry.change.removed]
        : []
    )
    const userIds = new Set<string>([...actorIds, ...mentionedIds])
    if (!hasMore) userIds.add(ticket.createdBy)
    const found = yield* users.fullByIds([...userIds])
    const byId = new Map<string, User>(found.map((user) => [user.id, user]))
    const items: Array<TicketActivityEntry> = visible.flatMap((entry) => {
      const actor = presentActor(entry.actor, byId)
      return actor === null
        ? []
        : [
            {
              kind: "change" as const,
              id: entry.id,
              occurredAt: entry.occurredAt,
              actor,
              cause: entry.cause,
              change: entry.change
            }
          ]
    })
    if (!hasMore) {
      const creator = byId.get(ticket.createdBy)
      items.push({
        kind: "created",
        id: "created",
        occurredAt: ticket.createdAt,
        actor: creator === undefined ? null : { kind: "user", user: creator },
        splitFrom: ticket.splitFrom ?? null
      })
    }
    const last = page.at(-1)
    const mentioned = new Set<string>(mentionedIds)
    return {
      items,
      people: found.filter((user) => mentioned.has(user.id)),
      nextCursor: hasMore && last !== undefined ? cursorOf(last) : null
    }
  })

  return TicketActivityFeed.of({ list })
})

export const layer = Layer.effect(TicketActivityFeed, make)
