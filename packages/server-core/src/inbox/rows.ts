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
  const latest =
    row !== null && row.latestAt.getTime() > delivery.at.getTime()
      ? {
          latest: row.latest,
          latestAt: row.latestAt,
          actorKind: row.actorKind,
          actorUserId: row.actorUserId,
          actorClientId: row.actorClientId,
          actorClientName: row.actorClientName,
          actorSource: row.actorSource
        }
      : {
          latest: delivery.event,
          latestAt: delivery.at,
          actorKind: delivery.actor.actorKind,
          actorUserId: delivery.actor.actorUserId ?? null,
          actorClientId: delivery.actor.actorClientId ?? null,
          actorClientName: delivery.actor.actorClientName ?? null,
          actorSource: delivery.actor.actorSource ?? null
        }
  return {
    state: "unread",
    direct: [
      ...(row?.direct ?? []).filter((entry) => !reasons.has(entry.reason)),
      ...delivery.direct
    ],
    ...latest,
    unreadCount: row?.state === "unread" ? row.unreadCount + 1 : 1,
    lastReadAt: row?.lastReadAt ?? null,
    readByClientName: row?.readByClientName ?? null
  }
}

export const resolve = (
  row: InboxRowValue,
  userId: string,
  resolutions: ReadonlyArray<InboxResolution>,
  at: Date
): InboxRowValue => {
  const direct = row.direct.filter(
    (entry) =>
      Date.parse(entry.at) > at.getTime() ||
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
): InboxRowValue =>
  row.latestAt.getTime() > at.getTime()
    ? row
    : {
        ...row,
        state: row.state === "done" ? "done" : "read",
        unreadCount: 0,
        lastReadAt: at,
        readByClientName: clientName
      }
