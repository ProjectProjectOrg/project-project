import { getRouteApi, Outlet, useLocation } from "@tanstack/react-router"

import { SettingsPage } from "@/components/shell/settings/SettingsPage"
import { PROJECT_SETTINGS_SECTIONS } from "@/features/projects/lib/projectSettingsSections"

const routeApi = getRouteApi("/_authed/orgs/$orgSlug/projects/$slug/settings")

export function ProjectSettingsLayout() {
  const { orgSlug, slug } = routeApi.useParams()
  const location = useLocation()
  const activeSection =
    PROJECT_SETTINGS_SECTIONS.find((section) => {
      const base = `/orgs/${orgSlug}/projects/${slug}/settings/${section.key}`
      return (
        location.pathname === base || location.pathname.startsWith(`${base}/`)
      )
    }) ?? PROJECT_SETTINGS_SECTIONS[0]

  return (
    <SettingsPage
      heading={activeSection.heading}
      description={activeSection.description}
    >
      <Outlet />
    </SettingsPage>
  )
}
