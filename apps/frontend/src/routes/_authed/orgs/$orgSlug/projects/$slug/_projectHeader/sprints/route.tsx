import { GroupPolicy } from "@pp/access/policies"
import { createFileRoute, Outlet } from "@tanstack/react-router"
import { useCallback } from "react"

import { useSidebarSlot } from "@/components/SidebarSlot"
import { SprintRail } from "@/components/sprints/SprintRail"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints"
)({
  component: SprintsTab,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_detail_tab_sprints() }
  })
})

function SprintsTab() {
  const { orgSlug, slug } = Route.useParams()
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")
  const renderRail = useCallback(
    () => <SprintRail orgSlug={orgSlug} slug={slug} canPlan={canPlan} />,
    [orgSlug, slug, canPlan]
  )
  useSidebarSlot(`sprints:${orgSlug}/${slug}`, renderRail)
  return <Outlet />
}
