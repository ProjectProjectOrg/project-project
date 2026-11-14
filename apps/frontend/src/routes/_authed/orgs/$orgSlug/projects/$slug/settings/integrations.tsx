import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/SettingsLayout"
import { IntegrationsSettings } from "@/features/projects/components/settings/IntegrationsSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/integrations"
)({
  component: IntegrationsSettings,
  loader: () =>
    settingsPage(
      m.project_settings_integrations_tab(),
      m.project_settings_integrations_description()
    )
})
