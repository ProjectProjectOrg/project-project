import { createFileRoute } from "@tanstack/react-router"

import { EverhourIntegrationPage } from "@/features/everhour/components/EverhourIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/everhour"
)({
  component: EverhourIntegrationPage,
  loader: () => ({
    crumb: {
      type: "static" as const,
      label: m.project_settings_everhour_heading()
    }
  })
})
