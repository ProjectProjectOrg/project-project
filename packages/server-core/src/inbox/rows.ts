import type {
  InboxDirect,
  InboxResolution,
  TicketActivityOutboxActor,
  inboxRow
} from "@pp/db/schema"
import type { InboxEventEncoded } from "@pp/shared"

export type InboxRowValue = Omit<
  typeof inboxRow.$inferSelect,
  "projectId" | "ticketId" | "userId"
>

export type Delivery = Readonly<{
  event: InboxEventEncoded
  direct: ReadonlyArray<InboxDirect>
  at: Date
  actor: TicketActivityOutboxActor
}>

export const deliver = (
  row: InboxRowValue | null,
  delivery: Delivery
): InboxRowValue => {
  const reasons = new Set(delivery.direct.map((entry) => entry.reason))
  return {
    state: "unread",
    direct: [
      ...(row?.direct ?? []).filter((entry) => !reasons.has(entry.reason)),
      ...delivery.direct
    ],
    latest: delivery.event,
    latestAt: delivery.at,
    actorKind: delivery.actor.actorKind,
    actorUserId: delivery.actor.actorUserId ?? null,
    actorClientId: delivery.actor.actorClientId ?? null,
    actorClientName: delivery.actor.actorClientName ?? null,
    actorSource: delivery.actor.actorSource ?? null,
    unreadCount: row?.state === "unread" ? row.unreadCount + 1 : 1,
    lastReadAt: row?.lastReadAt ?? null,
    readByClientName: row?.readByClientName ?? null
  }
}

export const resolve = (
  row: InboxRowValue,
  userId: string,
  resolutions: ReadonlyArray<InboxResolution>
): InboxRowValue => {
  const direct = row.direct.filter(
    (entry) =>
      !resolutions.some(
        (resolution) =>
          resolution.kind === "all" ||
          (resolution.kind === entry.reason && resolution.userId === userId)
      )
  )
  if (direct.length === row.direct.length) return row
  return { ...row, direct, state: direct.length === 0 ? "done" : row.state }
}

export const read = (
  row: InboxRowValue,
  at: Date,
  clientName: string | null
): InboxRowValue => ({
  ...row,
  state: row.state === "done" ? "done" : "read",
  unreadCount: 0,
  lastReadAt: at,
  readByClientName: clientName
})
