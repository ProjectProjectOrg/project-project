import {
  RecentTicketActivity,
  type ProjectStatus,
  type TicketActivityActor
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
  (actor.kind === "user" || actor.kind === "agent") &&
  actor.user.id === viewerId

const actorName = (actor: TicketActivityActor) => {
  if (actor.kind === "system") return SYSTEM_NAMES[actor.source]()
  if (actor.kind === "imported") return actor.displayName
  const name = actor.user.name || actor.user.email
  return actor.kind === "agent"
    ? m.org_dashboard_activity_actor_agent({ name, client: actor.client.name })
    : name
}

export const activityText = (
  activity: RecentTicketActivity,
  viewerId: string | undefined,
  statuses: ReadonlyArray<ProjectStatus>
) =>
  RecentTicketActivity.match(activity, {
    commented: ({ at }) =>
      m.org_dashboard_activity_commented({ when: formatRelative(at) }),
    created: ({ at }) =>
      m.org_dashboard_activity_created({ when: formatRelative(at) }),
    assigned: ({ actor, at }) => {
      if (at === undefined) return m.org_dashboard_activity_assigned()
      const when = formatRelative(at)
      if (actor === undefined) {
        return m.org_dashboard_activity_assigned_at({ when })
      }
      return isViewer(actor, viewerId)
        ? m.org_dashboard_activity_assigned_self({ when })
        : m.org_dashboard_activity_assigned_by({
            actor: actorName(actor),
            when
          })
    },
    status_changed: ({ actor, at, to }) => {
      const when = formatRelative(at)
      const status = statusLabelFor(to, statuses)
      return isViewer(actor, viewerId)
        ? m.org_dashboard_activity_status_self({ status, when })
        : m.org_dashboard_activity_status_by({
            actor: actorName(actor),
            status,
            when
          })
    }
  })
