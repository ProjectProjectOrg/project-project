import { Outlet } from "@tanstack/react-router"
import { useMemo } from "react"
import { useSidebarSlot } from "@/components/SidebarSlot"
import { SprintRail } from "./SprintRail"

export function SprintsLayout({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  const rail = useMemo(
    () => <SprintRail orgSlug={orgSlug} slug={slug} />,
    [orgSlug, slug]
  )
  useSidebarSlot(`sprints:${orgSlug}/${slug}`, rail)
  return <Outlet />
}
