import type { RecentTicketActivity } from "@pp/shared"
import {
  FilePlus2,
  MessageSquare,
  UserPlus,
  type LucideIcon
} from "lucide-react"

import { formatRelative } from "@/lib/relative-time"
import { m } from "@/paraglide/messages"

const ACTIVITY_ICONS: Readonly<
  Record<RecentTicketActivity["tag"], LucideIcon>
> = {
  commented: MessageSquare,
  created: FilePlus2,
  assigned: UserPlus
}

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
  const Icon = ACTIVITY_ICONS[activity.tag]
  return (
    <>
      <span className="grid size-6 place-items-center text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="col-[2/-1] min-w-0 text-sm text-muted-foreground">
        {activityText(activity)}
      </span>
    </>
  )
}
