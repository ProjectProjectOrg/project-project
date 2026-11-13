import { useLocation } from "@tanstack/react-router"
import { LayoutDashboard } from "lucide-react"
import { useRef } from "react"

import { NavHoverContext, NavItem } from "@/components/shell/NavItem"
import {
  matchProjectRoute,
  projectPageHoverIndex,
  ProjectScope
} from "@/components/shell/ProjectScope"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { useFluidHover } from "@/hooks/useFluidHover"
import { m } from "@/paraglide/messages"

const DASHBOARD_INDEX = 0

export function PrimaryNav({ orgSlug }: { orgSlug: string | null }) {
  const { pathname } = useLocation()
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  const match = orgSlug ? matchProjectRoute(pathname, orgSlug) : null
  const dashboardActive = pathname === (orgSlug ? `/orgs/${orgSlug}` : "/")
  const filledIndex = dashboardActive
    ? DASHBOARD_INDEX
    : match
      ? projectPageHoverIndex(match.page)
      : null
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
            hidden={hover.activeIndex === filledIndex}
            className="z-[1] rounded-lg"
          />
          {orgSlug ? (
            <NavItem
              to="/orgs/$orgSlug"
              params={{ orgSlug }}
              icon={LayoutDashboard}
              label={m.chrome_sidebar_dashboard()}
              index={DASHBOARD_INDEX}
              exact
            />
          ) : (
            <NavItem
              to="/"
              icon={LayoutDashboard}
              label={m.chrome_sidebar_dashboard()}
              index={DASHBOARD_INDEX}
              exact
            />
          )}
          {orgSlug ? <ProjectScope orgSlug={orgSlug} match={match} /> : null}
        </div>
      </NavHoverContext>
    </nav>
  )
}
