import { createFileRoute } from "@tanstack/react-router"

import { OrgIntegrations } from "@/features/integrations/components/OrgIntegrations"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/"
)({
  component: OrgIntegrations
})
