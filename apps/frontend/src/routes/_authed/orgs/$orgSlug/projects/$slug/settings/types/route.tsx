import { createFileRoute, Outlet } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/types"
)({
  component: Outlet,
  loader: () =>
    settingsPage(
      m.project_settings_types_tab(),
      m.project_settings_types_description()
    )
})
