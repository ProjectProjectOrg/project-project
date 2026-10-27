import { createFileRoute } from "@tanstack/react-router"

import { IntegrationsSettings } from "@/features/projects/components/settings/IntegrationsSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/integrations"
)({
  component: IntegrationsSettings,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_integrations_tab()
    }
  })
})
