import { GroupPolicy } from "@pp/access/policies"
import { getRouteApi, Outlet } from "@tanstack/react-router"
import { useCallback } from "react"

import { useSidebarSlot } from "@/components/shell/SidebarSlot"
import { SprintRail } from "@/features/sprints/components/SprintRail"
import { useProjectActor } from "@/lib/access"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints"
)

export function SprintsTab() {
  const { orgSlug, slug } = routeApi.useParams()
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")
  const renderRail = useCallback(
    () => <SprintRail orgSlug={orgSlug} slug={slug} canPlan={canPlan} />,
    [orgSlug, slug, canPlan]
  )
  useSidebarSlot(`sprints:${orgSlug}/${slug}`, renderRail)
  return <Outlet />
}
