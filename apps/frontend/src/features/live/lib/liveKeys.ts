import type { LiveChange, LiveEvent } from "@pp/shared"

import { Keys, projectScope, type ReactivityKey } from "@/api/keys"

const liveChangeKeys = (change: LiveChange): ReadonlyArray<ReactivityKey> => {
  const scope = projectScope(change.orgSlug, change.slug)
  if (change.kind === "ticket")
    return [
      ...Keys.ticketChanged(scope, change.id),
      Keys.ticketTitleQuery(scope),
      Keys.ticketUpdatedQuery(scope),
      Keys.tagUsage(scope),
      Keys.gitStates(scope)
    ]
  if (change.kind === "tickets")
    return [
      ...Keys.ticketsChanged(scope),
      Keys.ticketTitleQuery(scope),
      Keys.ticketUpdatedQuery(scope),
      Keys.tagUsage(scope),
      Keys.gitStates(scope)
    ]
  if (change.kind === "comments")
    return [Keys.comments(scope, change.ticketId), Keys.ticketComments(scope)]
  return [
    Keys.sprints(scope),
    Keys.sprint(scope, change.id),
    Keys.sprintMembership(scope),
    Keys.sprintMembership(scope, change.id),
    ...Keys.ticketsChanged(scope)
  ]
}

export const liveEventKeys =
  (ownOrigin: string) =>
  (event: LiveEvent): ReadonlyArray<ReactivityKey> => {
    if (event.kind === "heartbeat") return []
    if (event.kind === "resync") return [Keys.liveResync()]
    if (event.origin === ownOrigin) return []
    return liveChangeKeys(event)
  }

export const uniqueKeys = (
  batches: ReadonlyArray<ReadonlyArray<ReactivityKey>>
): ReadonlyArray<ReactivityKey> => {
  const keys = new Set(batches.flat())
  return keys.has(Keys.liveResync()) ? [Keys.liveResync()] : [...keys]
}
