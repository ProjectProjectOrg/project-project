import { GroupPolicy } from "@pp/access/policies"
import { Outlet } from "@tanstack/react-router"
import { useCallback } from "react"

import { useSidebarSlot } from "@/components/SidebarSlot"
import { useProjectActor } from "@/lib/access"

import { SprintRail } from "./SprintRail"

export function SprintsLayout({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")
  const renderRail = useCallback(
    () => <SprintRail orgSlug={orgSlug} slug={slug} canPlan={canPlan} />,
    [orgSlug, slug, canPlan]
  )
  useSidebarSlot(`sprints:${orgSlug}/${slug}`, renderRail)
  return <Outlet />
}
