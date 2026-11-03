import type {
  ProjectStatus,
  RecentTicketActivity,
  TicketActivityActor
} from "@pp/shared"

import { statusLabelFor } from "@/features/tickets/lib/ticketMeta"
import { formatRelative } from "@/lib/relativeTime"
import { m } from "@/paraglide/messages"

const SYSTEM_NAMES: Readonly<
  Record<
    Extract<TicketActivityActor, { kind: "system" }>["source"],
    () => string
  >
> = {
  github: () => m.tickets_activity_actor_github(),
  automation: () => m.tickets_activity_actor_automation(),
  import: () => m.tickets_activity_actor_import()
}

const isViewer = (actor: TicketActivityActor, viewerId: string | undefined) =>
  actor.kind !== "system" && actor.user.id === viewerId

const actorName = (actor: TicketActivityActor): string => {
  if (actor.kind === "system") return SYSTEM_NAMES[actor.source]()
  const name = actor.user.name || actor.user.email
  return actor.kind === "agent"
    ? m.org_dashboard_activity_actor_agent({ name, client: actor.client.name })
    : name
}

export const activityText = (
  activity: RecentTicketActivity,
  viewerId: string | undefined,
  statuses: ReadonlyArray<ProjectStatus>
): string => {
  switch (activity.tag) {
    case "commented":
      return m.org_dashboard_activity_commented({
        when: formatRelative(activity.at)
      })
    case "created":
      return m.org_dashboard_activity_created({
        when: formatRelative(activity.at)
      })
    case "assigned": {
      if (activity.at === undefined) return m.org_dashboard_activity_assigned()
      const when = formatRelative(activity.at)
      if (activity.actor === undefined) {
        return m.org_dashboard_activity_assigned_at({ when })
      }
      return isViewer(activity.actor, viewerId)
        ? m.org_dashboard_activity_assigned_self({ when })
        : m.org_dashboard_activity_assigned_by({
            actor: actorName(activity.actor),
            when
          })
    }
    case "status_changed": {
      const when = formatRelative(activity.at)
      const status = statusLabelFor(activity.to, statuses)
      return isViewer(activity.actor, viewerId)
        ? m.org_dashboard_activity_status_self({ status, when })
        : m.org_dashboard_activity_status_by({
            actor: actorName(activity.actor),
            status,
            when
          })
    }
  }
}
