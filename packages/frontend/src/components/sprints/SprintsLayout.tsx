import { Outlet } from "@tanstack/react-router"
import { useCallback } from "react"
import { useSidebarSlot } from "@/components/SidebarSlot"
import { SprintRail } from "./SprintRail"

export function SprintsLayout({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const renderRail = useCallback(
    () => <SprintRail orgSlug={orgSlug} slug={slug} />,
    [orgSlug, slug]
  )
  useSidebarSlot(`sprints:${orgSlug}/${slug}`, renderRail)
  return <Outlet />
}
