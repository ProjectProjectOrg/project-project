import { CalendarRange, Info, ListChecks } from "lucide-react"

import { NavRow, NavSubRows } from "@/components/shell/ProjectNavRows"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import { m } from "@/paraglide/messages"

export type ProjectRoute = Readonly<{
  page: "backlog" | "sprints" | "about" | "settings"
  sub: string | null
}>

const HOVER = {
  backlog: 2,
  sprints: 3,
  current: 4,
  about: 5
} as const

const iconClass = "size-4"

export function ProjectNav({
  orgSlug,
  slug,
  route
}: {
  orgSlug: string
  slug: string
  route: ProjectRoute | null
}) {
  const active = useActiveSprint(orgSlug, slug)
  const sprintsSub = route?.page === "sprints" ? route.sub : undefined
  const onCurrent =
    sprintsSub === "current" ||
    (active !== null && sprintsSub === active.sprint.id)
  return (
    <div className="flex flex-col">
      <NavRow
        index={HOVER.backlog}
        to="/orgs/$orgSlug/projects/$slug"
        params={{ orgSlug, slug }}
        icon={<ListChecks className={iconClass} strokeWidth={1.75} />}
        label={m.project_detail_tab_backlog()}
        active={route?.page === "backlog"}
      />
      <NavRow
        index={HOVER.sprints}
        to="/orgs/$orgSlug/projects/$slug/sprints"
        params={{ orgSlug, slug }}
        icon={<CalendarRange className={iconClass} strokeWidth={1.75} />}
        label={m.project_detail_tab_sprints()}
        active={sprintsSub !== undefined && !onCurrent}
      />
      {active !== null && (
        <NavSubRows>
          <NavRow
            index={HOVER.current}
            to="/orgs/$orgSlug/projects/$slug/sprints/current"
            params={{ orgSlug, slug }}
            label={m.project_detail_tab_sprints_current()}
            meta={active.countdown}
            active={onCurrent}
          />
        </NavSubRows>
      )}
      <div className="h-3" />
      <NavRow
        index={HOVER.about}
        to="/orgs/$orgSlug/projects/$slug/about"
        params={{ orgSlug, slug }}
        icon={<Info className={iconClass} strokeWidth={1.75} />}
        label={m.project_detail_tab_about()}
        active={route?.page === "about"}
      />
    </div>
  )
}
