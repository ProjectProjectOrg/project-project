import type { User } from "@pp/shared"
import { SidebarPanel } from "@pp/ui/sidebar"
import {
  useLocation,
  useMatches,
  useParams,
  useSearch
} from "@tanstack/react-router"
import { useState } from "react"

import { SettingsSidebar } from "@/components/shell/settings/SettingsSidebar"
import { AppRail } from "@/components/shell/sidebar/AppRail"
import { DashboardPanel } from "@/components/shell/sidebar/DashboardPanel"
import { PanelHeader } from "@/components/shell/sidebar/PanelHeader"
import { ProjectPanel } from "@/components/shell/sidebar/ProjectPanel"
import {
  DASHBOARD_PANEL,
  isSettingsPath,
  railOrder,
  SETTINGS_PANEL,
  sidebarScope
} from "@/components/shell/sidebar/sidebarRoute"
import { usePanelTransition } from "@/components/shell/sidebar/usePanelTransition"
import { ProjectBannerWarmup } from "@/features/projects/components/ProjectBannerWarmup"
import { useOrgProjects } from "@/features/projects/hooks/useOrgProjects"

export function Sidebar({ user }: Readonly<{ user: User }>) {
  return (
    <aside className="row-span-2 hidden lg:flex">
      <SidebarContent user={user} />
    </aside>
  )
}

export function SidebarContent({ user }: Readonly<{ user: User }>) {
  const { orgSlug: routeOrgSlug, slug } = useParams({ strict: false })
  const orgSlug = routeOrgSlug ?? user.activeOrgSlug
  const location = useLocation()
  const { sprint } = useSearch({ strict: false })
  const inSettings = useMatches({
    select: (matches) => isSettingsPath(matches.at(-1)?.pathname ?? "")
  })
  const [backHref, setBackHref] = useState<string | null>(null)
  if (!isSettingsPath(location.pathname) && backHref !== location.href)
    setBackHref(location.href)

  const projects = useOrgProjects(orgSlug)
  const scope = sidebarScope(location.pathname, orgSlug, sprint)
  const project =
    scope.kind === "project"
      ? projects.find((candidate) => candidate.slug === scope.slug)
      : undefined
  const panelKey = inSettings
    ? SETTINGS_PANEL
    : project === undefined
      ? DASHBOARD_PANEL
      : project.slug
  const transition = usePanelTransition(panelKey, railOrder(projects))

  return (
    <div className="flex h-full min-h-0 w-full">
      <AppRail
        user={user}
        orgSlug={orgSlug}
        scope={scope}
        projects={projects}
      />
      {orgSlug === null
        ? null
        : projects.map((candidate) => (
            <ProjectBannerWarmup
              key={candidate.slug}
              orgSlug={orgSlug}
              project={candidate}
            />
          ))}
      <SidebarPanel
        panelKey={panelKey}
        transition={transition}
        header={
          inSettings ? undefined : (
            <PanelHeader orgSlug={orgSlug} project={project} />
          )
        }
      >
        {inSettings ? (
          <SettingsSidebar
            orgSlug={orgSlug}
            projectSlug={slug ?? null}
            backHref={backHref}
          />
        ) : project !== undefined &&
          orgSlug !== null &&
          scope.kind === "project" ? (
          <ProjectPanel
            orgSlug={orgSlug}
            project={project}
            route={scope.route}
            viewing={scope.viewing}
          />
        ) : (
          <DashboardPanel
            orgSlug={orgSlug}
            page={scope.kind === "dashboard" ? scope.page : null}
            projects={projects}
          />
        )}
      </SidebarPanel>
    </div>
  )
}
