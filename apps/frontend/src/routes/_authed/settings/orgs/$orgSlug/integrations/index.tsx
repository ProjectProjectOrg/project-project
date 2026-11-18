import { createFileRoute } from "@tanstack/react-router"

import { OrgIntegrations } from "@/features/integrations/components/OrgIntegrations"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/integrations/"
)({
  component: OrgIntegrations,
  loader: () => ({
    page: {
      heading: m.org_settings_integrations_tab(),
      description: m.org_settings_integrations_description()
    }
  })
})
