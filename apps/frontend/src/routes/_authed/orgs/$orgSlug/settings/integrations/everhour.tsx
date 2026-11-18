import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { EverhourIntegrationPage } from "@/features/everhour/components/EverhourIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/everhour"
)({
  component: EverhourIntegrationPage,
  loader: () => ({
    crumb: Crumb.static({ label: m.project_settings_everhour_heading() })
  })
})
