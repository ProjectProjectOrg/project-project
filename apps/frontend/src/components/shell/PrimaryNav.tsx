import { useLocation } from "@tanstack/react-router"
import { LayoutDashboard } from "lucide-react"
import { useRef } from "react"

import { NavHoverContext, NavItem } from "@/components/shell/NavItem"
import { ProjectsGroup } from "@/components/shell/ProjectsGroup"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { useFluidHover } from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function PrimaryNav({ orgSlug }: { orgSlug: string | null }) {
  const { pathname } = useLocation()
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  const projectsExpanded = orgSlug !== null && isProjectsPath(pathname, orgSlug)
  const hoverInGroup =
    projectsExpanded && hover.activeIndex !== null && hover.activeIndex >= 1
  const dashboardActive = pathname === (orgSlug ? `/orgs/${orgSlug}` : "/")
  return (
    <nav className="px-3 py-2">
      <NavHoverContext value={hover.registerItem}>
        <div
          ref={listRef}
          role="presentation"
          onMouseEnter={hover.handlers.onMouseEnter}
          onMouseMove={hover.handlers.onMouseMove}
          onMouseLeave={hover.handlers.onMouseLeave}
          onClick={hover.handlers.onClick}
          className="relative flex flex-col gap-1"
        >
          <FluidHoverHighlight
            hover={hover}
            hidden={dashboardActive && hover.activeIndex === 0}
            className={cn("z-[1]", hoverInGroup ? "rounded-sm" : "rounded-lg")}
          />
          {orgSlug ? (
            <NavItem
              to="/orgs/$orgSlug"
              params={{ orgSlug }}
              icon={LayoutDashboard}
              label={m.chrome_sidebar_dashboard()}
              index={0}
              exact
            />
          ) : (
            <NavItem
              to="/"
              icon={LayoutDashboard}
              label={m.chrome_sidebar_dashboard()}
              index={0}
              exact
            />
          )}
          {orgSlug && (
            <ProjectsGroup orgSlug={orgSlug} expanded={projectsExpanded} />
          )}
        </div>
      </NavHoverContext>
    </nav>
  )
}

function isProjectsPath(pathname: string, orgSlug: string) {
  const projectsBase = `/orgs/${orgSlug}/projects`
  return pathname === projectsBase || pathname.startsWith(`${projectsBase}/`)
}
