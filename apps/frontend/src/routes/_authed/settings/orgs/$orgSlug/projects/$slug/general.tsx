import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import { ProjectGeneralSettings } from "@/features/projects/components/settings/ProjectGeneralSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/general"
)({
  component: ProjectGeneralSettings,
  loader: () =>
    settingsPage(
      m.project_settings_general_tab(),
      m.project_settings_general_description()
    )
})
