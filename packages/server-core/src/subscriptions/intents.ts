import { extractMentionLinks } from "@pp/shared"

import { parseCommentsRegion } from "../comments/comments-region"
import type * as TicketDocs from "../tickets/TicketDocs"

export type SubscriptionReason =
  | "created"
  | "commented"
  | "assigned"
  | "mentioned"

export type SubscriptionIntent = Readonly<{
  ticketId: string
  userId: string
  reason: SubscriptionReason
}>

export type SubscriptionSource = Pick<
  TicketDocs.TicketDocument,
  "id" | "createdBy" | "assignees" | "body" | "commentsRegion"
>

export const overridesUnsubscribe = (reason: SubscriptionReason): boolean =>
  reason === "assigned" || reason === "mentioned"

const mentionCounts = (markdown: string): ReadonlyMap<string, number> => {
  const counts = new Map<string, number>()
  for (const link of extractMentionLinks(markdown)) {
    if (link.parsed?.type !== "user") continue
    counts.set(link.parsed.id, (counts.get(link.parsed.id) ?? 0) + 1)
  }
  return counts
}

const newlyMentioned = (
  before: string,
  after: string
): ReadonlyArray<string> => {
  if (before === after) return []
  const previous = mentionCounts(before)
  return [...mentionCounts(after)]
    .filter(([userId, count]) => count > (previous.get(userId) ?? 0))
    .map(([userId]) => userId)
}

const commentIntents = (
  before: string,
  after: string
): ReadonlyArray<Readonly<{ userId: string; reason: SubscriptionReason }>> => {
  if (before === after) return []
  const previous = new Map(
    parseCommentsRegion(before).map((block) => [block.id, block.body])
  )
  return parseCommentsRegion(after).flatMap((block) => {
    const earlier = previous.get(block.id)
    const mentions = newlyMentioned(earlier ?? "", block.body).map(
      (userId) => ({ userId, reason: "mentioned" as const })
    )
    return earlier === undefined && block.author.kind === "user"
      ? [
          { userId: block.author.userId, reason: "commented" as const },
          ...mentions
        ]
      : mentions
  })
}

export const subscriptionIntents = (
  before: SubscriptionSource | null,
  after: SubscriptionSource
): ReadonlyArray<SubscriptionIntent> => {
  const previousAssignees = new Set<string>(before?.assignees ?? [])
  const candidates = [
    ...(before === null
      ? [{ userId: after.createdBy, reason: "created" as const }]
      : []),
    ...after.assignees
      .filter((userId) => !previousAssignees.has(userId))
      .map((userId) => ({ userId, reason: "assigned" as const })),
    ...newlyMentioned(before?.body ?? "", after.body).map((userId) => ({
      userId,
      reason: "mentioned" as const
    })),
    ...commentIntents(before?.commentsRegion ?? "", after.commentsRegion)
  ]
  const byUser = new Map<string, SubscriptionReason>()
  for (const { userId, reason } of candidates) {
    const current = byUser.get(userId)
    if (
      current === undefined ||
      (!overridesUnsubscribe(current) && overridesUnsubscribe(reason))
    )
      byUser.set(userId, reason)
  }
  return [...byUser].map(([userId, reason]) => ({
    ticketId: after.id,
    userId,
    reason
  }))
}
