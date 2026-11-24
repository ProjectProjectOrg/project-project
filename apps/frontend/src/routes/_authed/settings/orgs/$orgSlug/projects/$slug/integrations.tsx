import { createFileRoute } from "@tanstack/react-router"

import { settingsPage } from "@/components/shell/settings/settingsPage"
import { IntegrationsSettings } from "@/features/projects/components/settings/IntegrationsSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/integrations"
)({
  component: IntegrationsSettings,
  loader: () =>
    settingsPage(
      m.project_settings_integrations_tab(),
      m.project_settings_integrations_description()
    )
})
