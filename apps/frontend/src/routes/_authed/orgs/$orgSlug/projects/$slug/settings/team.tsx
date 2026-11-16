import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { TeamSettings } from "@/features/members/components/TeamSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/team"
)({
  component: TeamSettings,
  loader: () =>
    settingsPage(
      m.project_settings_team_tab(),
      m.project_settings_team_description()
    )
})
