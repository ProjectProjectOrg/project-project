import {
  decodeCursor,
  encodeCursor,
  GIT_ACTIVITY_KINDS,
  ProjectScope,
  TICKET_ACTIVITY_PAGE_SIZE,
  Validation,
  type ActivityActorShape,
  type NotFound,
  type TicketActivityActor,
  type TicketActivityEntry,
  type TicketActivityPage,
  type User
} from "@pp/shared"
import * as Context from "effect/Context"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

import type { MarkdownError } from "../markdown/Markdown"
import { TicketDocs, type MalformedTicketDocument } from "../tickets/TicketDocs"
import { Users } from "../users/Users"
import { coalesceActivity } from "./coalesce"
import {
  TicketActivity,
  type ActivityPageCursor,
  type StoredTicketActivity
} from "./TicketActivity"

export interface TicketActivityFeedShape {
  readonly list: (
    ticketId: string,
    cursor: string | undefined
  ) => Effect.Effect<
    TicketActivityPage,
    NotFound | Validation | MarkdownError | MalformedTicketDocument,
    ProjectScope
  >
}

export class TicketActivityFeed extends Context.Service<
  TicketActivityFeed,
  TicketActivityFeedShape
>()("@pp/server-core/activity/TicketActivityFeed") {}

const parseCursor = (
  cursor: string | undefined
): Effect.Effect<ActivityPageCursor | null, Validation> =>
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

const cursorOf = (entry: StoredTicketActivity): string =>
  encodeCursor({
    id: String(entry.seq),
    sort: DateTime.formatIso(DateTime.fromDateUnsafe(entry.occurredAt))
  })

const presentActor = (
  actor: ActivityActorShape,
  users: ReadonlyMap<string, User>
): TicketActivityActor | null => {
  if (actor.kind === "system") return actor
  const user = users.get(actor.userId)
  if (user === undefined) return null
  return actor.kind === "user"
    ? { kind: "user", user }
    : {
        kind: "agent",
        user,
        client: { id: actor.clientId, name: actor.clientName }
      }
}

export const TicketActivityFeedLive = Layer.effect(
  TicketActivityFeed,
  Effect.gen(function* () {
    const activity = yield* TicketActivity
    const ticketDocs = yield* TicketDocs
    const users = yield* Users

    const list: TicketActivityFeedShape["list"] = (ticketId, cursor) =>
      Effect.gen(function* () {
        const scope = yield* ProjectScope
        const ticket = yield* ticketDocs.read(
          scope.orgSlug,
          scope.slug,
          ticketId
        )
        const before = yield* parseCursor(cursor)
        const rows = yield* activity.page(
          scope.projectId,
          ticket.id,
          before,
          TICKET_ACTIVITY_PAGE_SIZE + 1
        )
        const hasMore = rows.length > TICKET_ACTIVITY_PAGE_SIZE
        const page = rows.slice(0, TICKET_ACTIVITY_PAGE_SIZE)
        const showsGit = scope.permissions.can({ github: ["read"] })
        const visible = coalesceActivity(
          showsGit
            ? page
            : page.filter((entry) => !GIT_ACTIVITY_KINDS.has(entry.change.kind))
        )
        const userIds = new Set<string>(
          visible.flatMap((entry) =>
            entry.actor.kind === "system" ? [] : [entry.actor.userId]
          )
        )
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
            actor:
              creator === undefined ? null : { kind: "user", user: creator },
            splitFrom: ticket.splitFrom ?? null
          })
        }
        const last = page.at(-1)
        return {
          items,
          nextCursor: hasMore && last !== undefined ? cursorOf(last) : null
        }
      })

    return TicketActivityFeed.of({ list })
  })
)
