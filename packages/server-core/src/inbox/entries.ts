import type {
  InboxResolution,
  TicketActivityOutboxActor,
  inboxEntry
} from "@pp/db/schema"
import type { InboxEntryKind, InboxEventEncoded } from "@pp/shared"

export type EntryValue = Omit<
  typeof inboxEntry.$inferSelect,
  "id" | "projectId" | "ticketId" | "userId" | "key" | "createdAt"
>

export const assignedKey = "assigned"
export const descriptionMentionKey = "mention:description"
export const updatesKey = "updates"
export const threadMentionKey = (threadId: string) =>
  `mention:thread:${threadId}`

export const mentionKey = (threadId: string | null) =>
  threadId === null ? descriptionMentionKey : threadMentionKey(threadId)

export const kindOfKey = (key: string) =>
  (key === assignedKey
    ? "assigned"
    : key === updatesKey
      ? "updates"
      : "mentioned") satisfies InboxEntryKind

export type Delivery = Readonly<{
  key: string
  event: InboxEventEncoded
  commentId: string | null
  at: Date
  actor: TicketActivityOutboxActor
}>

const actorOf = (actor: TicketActivityOutboxActor) => ({
  actorKind: actor.actorKind,
  actorUserId: actor.actorUserId ?? null,
  actorClientId: actor.actorClientId ?? null,
  actorClientName: actor.actorClientName ?? null,
  actorSource: actor.actorSource ?? null
})

export const deliver = (entry: EntryValue | null, delivery: Delivery) => {
  if (
    entry?.state === "cleared" &&
    entry.resolvedAt !== null &&
    entry.resolvedAt.getTime() > delivery.at.getTime()
  )
    return entry
  const newer =
    entry !== null && entry.latestAt.getTime() > delivery.at.getTime()
  if (newer && entry.state !== "unread") return entry
  const latest =
    entry !== null && newer
      ? {
          latest: entry.latest,
          latestAt: entry.latestAt,
          commentId: entry.commentId,
          actorKind: entry.actorKind,
          actorUserId: entry.actorUserId,
          actorClientId: entry.actorClientId,
          actorClientName: entry.actorClientName,
          actorSource: entry.actorSource
        }
      : {
          latest: delivery.event,
          latestAt: delivery.at,
          commentId: delivery.commentId,
          ...actorOf(delivery.actor)
        }
  return {
    kind: kindOfKey(delivery.key),
    state: "unread",
    clearedBy: null,
    resolvedAt: null,
    revision: (entry?.revision ?? 0) + 1,
    readRevision: entry?.readRevision ?? 0,
    eventCount: entry?.state === "unread" ? entry.eventCount + 1 : 1,
    ...latest,
    readByClientName: entry?.readByClientName ?? null
  } satisfies EntryValue
}

const isCurrent = (entry: EntryValue, revision: number) =>
  revision === entry.revision

export const read = (
  entry: EntryValue,
  revision: number,
  clientName: string | null
) => {
  if (!isCurrent(entry, revision) || entry.state === "cleared") return entry
  const stays = entry.kind === "mentioned"
  return {
    ...entry,
    state: stays ? "read" : "cleared",
    clearedBy: stays ? null : "read",
    readRevision: entry.revision,
    eventCount: 0,
    readByClientName: clientName
  } satisfies EntryValue
}

export const markUnread = (entry: EntryValue) =>
  entry.state === "unread"
    ? entry
    : ({
        ...entry,
        state: "unread",
        clearedBy: null,
        eventCount: Math.max(entry.eventCount, 1)
      } satisfies EntryValue)

export const remove = (entry: EntryValue, revision: number) =>
  !isCurrent(entry, revision) ||
  (entry.state === "cleared" && entry.clearedBy === "deleted")
    ? entry
    : ({
        ...entry,
        state: "cleared",
        clearedBy: "deleted",
        readRevision: entry.revision,
        eventCount: 0
      } satisfies EntryValue)

const resolves = (key: string, userId: string, resolution: InboxResolution) =>
  resolution.kind === "finished"
    ? key !== updatesKey
    : resolution.kind === "unassigned"
      ? key === assignedKey && resolution.userId === userId
      : key === threadMentionKey(resolution.threadId) &&
        resolution.userId === userId

export const resolve = (
  entry: EntryValue,
  key: string,
  userId: string,
  resolutions: ReadonlyArray<InboxResolution>,
  at: Date
) => {
  if (entry.state === "cleared" || entry.latestAt.getTime() > at.getTime())
    return entry
  const resolution = resolutions.find((candidate) =>
    resolves(key, userId, candidate)
  )
  if (resolution === undefined) return entry
  return {
    ...entry,
    state: "cleared",
    clearedBy: resolution.kind,
    resolvedAt: at,
    readRevision: entry.revision,
    eventCount: 0
  } satisfies EntryValue
}
