import { Outlet } from "@tanstack/react-router"
import { SprintRail } from "./SprintRail"

export function SprintsLayout({
  orgSlug,
  slug
}: {
  orgSlug: string
  slug: string
}) {
  return (
    <div className="flex gap-6">
      <SprintRail orgSlug={orgSlug} slug={slug} />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
