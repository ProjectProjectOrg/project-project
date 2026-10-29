import { useAtomValue } from "@effect/atom-react"
import type { RecentTicketActivity } from "@pp/shared"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import {
  ArrowRightLeft,
  FilePlus2,
  MessageSquare,
  UserPlus,
  type LucideIcon
} from "lucide-react"

import { currentUserId } from "@/features/auth/atoms/auth"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"

import { activityText } from "../lib/activityText"

const ACTIVITY_ICONS: Readonly<
  Record<RecentTicketActivity["tag"], LucideIcon>
> = {
  commented: MessageSquare,
  created: FilePlus2,
  assigned: UserPlus,
  status_changed: ArrowRightLeft
}

export function TicketActivityLabel({
  activity
}: Readonly<{ activity: RecentTicketActivity | null }>) {
  const { orgSlug, slug } = useProjectRoute()
  const viewerId = useAtomValue(currentUserId)
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(orgSlug, slug))
  )
  if (activity === null) return null
  const statuses = AsyncResult.isSuccess(statusesResult)
    ? statusesResult.value
    : []
  const Icon = ACTIVITY_ICONS[activity.tag]
  return (
    <>
      <span className="grid size-8 place-items-center text-muted-foreground">
        <Icon className="size-4" strokeWidth={1.75} />
      </span>
      <span className="col-[2/-1] min-w-0 text-sm text-muted-foreground">
        {activityText(activity, viewerId, statuses)}
      </span>
    </>
  )
}
