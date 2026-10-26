import { GroupPolicy } from "@pp/access/policies"
import { getRouteApi, Outlet } from "@tanstack/react-router"
import { useCallback } from "react"

import { useSidebarSlot } from "@/components/shell/SidebarSlot"
import { projectRequest } from "@/features/projects/atoms/projects"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { SprintRail } from "@/features/sprints/components/SprintRail"
import { useProjectActor } from "@/lib/access"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints"
)

export function SprintsTab() {
  const { orgSlug, slug } = routeApi.useParams()
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")
  const renderRail = useCallback(
    () => (
      <ProjectContext value={projectRequest(orgSlug, slug)}>
        <SprintRail canPlan={canPlan} />
      </ProjectContext>
    ),
    [orgSlug, slug, canPlan]
  )
  useSidebarSlot(`sprints:${orgSlug}/${slug}`, renderRail)
  return <Outlet />
}
