import type { RecentTicketActivity } from "@pp/shared"

import { formatRelative } from "@/lib/relative-time"
import { m } from "@/paraglide/messages"

const activityText = (activity: RecentTicketActivity): string => {
  switch (activity.tag) {
    case "commented":
      return m.org_dashboard_activity_commented({
        when: formatRelative(activity.at)
      })
    case "created":
      return m.org_dashboard_activity_created({
        when: formatRelative(activity.at)
      })
    case "assigned":
      return m.org_dashboard_activity_assigned()
  }
}

export function TicketActivityLabel({
  activity
}: Readonly<{ activity: RecentTicketActivity | null }>) {
  if (activity === null) return null
  return (
    <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
      {activityText(activity)}
    </span>
  )
}
