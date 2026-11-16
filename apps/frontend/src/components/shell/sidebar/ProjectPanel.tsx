import { useAtomValue } from "@effect/atom-react"
import { ProjectPolicy } from "@pp/access/policies"
import type { PinTarget, Project } from "@pp/shared"
import { CalendarRange, Info, ListChecks, Settings } from "@pp/ui/icons"
import {
  SidebarPanelBody,
  SidebarRow,
  SidebarSubRows
} from "@pp/ui/sidebar"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import {
  projectNavActive,
  type ProjectRoute
} from "@/components/shell/sidebar/sidebarRoute"
import { pinsFor, pinsRequest } from "@/features/pins/atoms/pins"
import { ProjectPins } from "@/features/pins/components/ProjectPins"
import { samePin } from "@/features/pins/lib/pins"
import {
  projectActor,
  projectRequest
} from "@/features/projects/atoms/projects"
import { ProjectSetupLine } from "@/features/projects/components/ProjectSetupLine"
import { ProjectContext } from "@/features/projects/hooks/useProject"
import { useActiveSprint } from "@/features/sprints/hooks/useActiveSprint"
import { m } from "@/paraglide/messages"

export function ProjectPanel({
  orgSlug,
  project,
  route,
  viewing
}: Readonly<{
  orgSlug: string
  project: Project
  route: ProjectRoute
  viewing: PinTarget | null
}>) {
  const slug = project.slug
  const params = { orgSlug, slug }
  const active = useActiveSprint(orgSlug, slug)
  const activeSprintId = active?.sprint.id ?? null
  const pins = useAtomValue(pinsFor(pinsRequest(orgSlug)))
  const viewingPinned =
    viewing !== null &&
    Result.isSuccess(pins) &&
    pins.value.some((pin) => samePin(pin, { projectSlug: slug, ...viewing }))
  const current = projectNavActive(route, activeSprintId, viewingPinned)
  const actor = useAtomValue(projectActor(projectRequest(orgSlug, slug)))
  const canSettings = ProjectPolicy.canUpdate(actor, { settings: true })
  return (
    <ProjectContext value={projectRequest(orgSlug, slug)}>
      <ProjectSetupLine />
      <SidebarPanelBody label={project.name}>
        <SidebarRow
          icon={<ListChecks />}
          label={m.project_detail_tab_backlog()}
          active={current === "backlog"}
          render={
            <Link
              activeOptions={{ exact: true, includeSearch: false }}
              to="/orgs/$orgSlug/projects/$slug"
              params={params}
            />
          }
        />
        <SidebarRow
          icon={<CalendarRange />}
          label={m.project_detail_tab_sprints()}
          active={current === "sprints"}
          render={
            <Link
              activeOptions={{ exact: true, includeSearch: false }}
              to="/orgs/$orgSlug/projects/$slug/sprints"
              params={params}
            />
          }
        />
        {active === null ? null : (
          <SidebarSubRows>
            <SidebarRow
              label={m.project_detail_tab_sprints_current()}
              meta={active.countdown}
              active={current === "current"}
              render={
                <Link
                  activeOptions={{ exact: true, includeSearch: false }}
                  to="/orgs/$orgSlug/projects/$slug/sprints/current"
                  params={params}
                />
              }
            />
          </SidebarSubRows>
        )}
        <SidebarRow
          icon={<Info />}
          label={m.project_detail_tab_about()}
          active={current === "about"}
          render={
            <Link
              activeOptions={{ exact: true, includeSearch: false }}
              to="/orgs/$orgSlug/projects/$slug/about"
              params={params}
            />
          }
        />
        {canSettings ? (
          <SidebarRow
            icon={<Settings />}
            label={m.chrome_sidebar_menu_settings()}
            submenu
            render={
              <Link
                activeOptions={{ exact: true, includeSearch: false }}
                to="/orgs/$orgSlug/projects/$slug/settings"
                params={params}
              />
            }
          />
        ) : null}
        <ProjectPins
          orgSlug={orgSlug}
          slug={slug}
          viewing={viewing}
          activeSprintId={activeSprintId}
        />
      </SidebarPanelBody>
    </ProjectContext>
  )
}
