import type { InboxEntry, TicketActivityActor } from "@pp/shared"
import * as Match from "effect/Match"

import { m } from "@/paraglide/messages"

export const actorName = (actor: TicketActivityActor | null) => {
  if (actor === null) return m.tickets_activity_actor_unknown()
  if (actor.kind === "imported") return actor.displayName
  if (actor.kind === "system") {
    if (actor.source === "github") return m.tickets_activity_actor_github()
    if (actor.source === "import") return m.tickets_activity_actor_import()
    return m.tickets_activity_actor_automation()
  }
  return actor.user.name || actor.user.email
}

export const eventSummary = (
  entry: InboxEntry,
  statusLabel: (status: string) => string
) =>
  Match.value(entry.latest).pipe(
    Match.discriminatorsExhaustive("kind")({
      assigned: () => m.inbox_event_assigned(),
      mentioned: ({ commentId }) =>
        commentId === null
          ? m.inbox_event_mentioned_description()
          : m.inbox_event_mentioned(),
      commented: () => m.inbox_event_commented(),
      status_changed: ({ to }) =>
        m.inbox_event_status_changed({ status: statusLabel(to) }),
      unblocked: ({ by }) => m.inbox_event_unblocked({ ticket: by }),
      archived: () => m.inbox_event_archived(),
      moved: ({ fromProject }) => m.inbox_event_moved({ project: fromProject }),
      split: ({ into }) => m.inbox_event_split({ count: into.length }),
      reassigned: () => m.inbox_event_reassigned()
    })
  )
