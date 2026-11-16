import type { inboxRow } from "@pp/db/schema"
import { InboxEvent, type InboxItem, TicketId, TicketStatus } from "@pp/shared"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"

import { actorOf, presentActor } from "../activity/actorRow"
import * as Users from "../users/Users"

const decodeEvent = Schema.decodeUnknownSync(InboxEvent)
const decodeTicketId = Schema.decodeUnknownSync(TicketId)
const decodeStatus = Schema.decodeUnknownSync(TicketStatus)

export type InboxItemRow = Readonly<{
  row: typeof inboxRow.$inferSelect
  projectSlug: string
  title: string
  status: string
  archivedAt: Date | null
}>

export const inboxItems = Effect.fnUntraced(function* (
  rows: ReadonlyArray<InboxItemRow>
) {
  const users = yield* Users.Users
  const actors = rows.map(({ row }) => actorOf(row))
  const people = yield* users.fullByIds([
    ...new Set(
      actors.flatMap((actor) => (actor.kind === "system" ? [] : actor.userId))
    )
  ])
  const peopleById = new Map(people.map((user) => [user.id, user]))
  return rows.map(
    ({ row, projectSlug, title, status, archivedAt }, index): InboxItem => ({
      projectSlug,
      ticket: {
        id: decodeTicketId(row.ticketId),
        title,
        status: decodeStatus(status),
        archived: archivedAt !== null
      },
      unread: row.state === "unread",
      direct: row.direct.map((entry) => entry.reason),
      latest: decodeEvent(row.latest),
      latestAt: row.latestAt,
      firstAt: row.firstAt,
      actor: presentActor(actors[index], peopleById),
      unreadCount: row.unreadCount,
      lastReadAt: row.lastReadAt
    })
  )
})
