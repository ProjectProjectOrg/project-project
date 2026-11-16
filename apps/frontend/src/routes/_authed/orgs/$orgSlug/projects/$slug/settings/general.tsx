import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { ProjectGeneralSettings } from "@/features/projects/components/settings/ProjectGeneralSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/general"
)({
  component: ProjectGeneralSettings,
  loader: () =>
    settingsPage(
      m.project_settings_general_tab(),
      m.project_settings_general_description()
    )
})
