import type { Project } from "@pp/shared"
import { LayoutDashboard, LayoutGrid, Settings } from "@pp/ui/icons"
import { SidebarPanelBody, SidebarRow } from "@pp/ui/sidebar"
import { Link } from "@tanstack/react-router"

import { DashboardPins } from "@/features/pins/components/DashboardPins"
import { useOrgActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

export function DashboardPanel({
  orgSlug,
  page,
  projects
}: Readonly<{
  orgSlug: string | null
  page: "overview" | "projects" | null
  projects: ReadonlyArray<Project>
}>) {
  return (
    <>
      {orgSlug === null ? null : (
        <SidebarPanelBody label={m.chrome_sidebar_dashboard()}>
          <SidebarRow
            icon={<LayoutDashboard />}
            label={m.chrome_sidebar_overview()}
            active={page === "overview"}
            render={
              <Link
                activeOptions={{ exact: true, includeSearch: false }}
                to="/orgs/$orgSlug"
                params={{ orgSlug }}
              />
            }
          />
          <SidebarRow
            icon={<LayoutGrid />}
            label={m.chrome_sidebar_all_projects()}
            active={page === "projects"}
            render={
              <Link
                activeOptions={{ exact: true, includeSearch: false }}
                to="/orgs/$orgSlug/projects"
                params={{ orgSlug }}
              />
            }
          />
          <OrgSettingsRow orgSlug={orgSlug} />
          <DashboardPins orgSlug={orgSlug} projects={projects} />
        </SidebarPanelBody>
      )}
    </>
  )
}

function OrgSettingsRow({ orgSlug }: Readonly<{ orgSlug: string }>) {
  if (!useOrgActor(orgSlug).call("org", "rename")) return null
  return (
    <SidebarRow
      icon={<Settings />}
      label={m.chrome_sidebar_menu_settings()}
      submenu
      render={
        <Link
          activeOptions={{ exact: true, includeSearch: false }}
          to="/settings/orgs/$orgSlug"
          params={{ orgSlug }}
        />
      }
    />
  )
}
