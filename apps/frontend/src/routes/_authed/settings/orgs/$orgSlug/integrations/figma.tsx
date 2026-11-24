import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { FigmaIntegrationPage } from "@/features/figma/components/FigmaIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/integrations/figma"
)({
  component: FigmaIntegrationPage,
  loader: () => ({
    crumb: Crumb.static({ label: m.figma_project_title() })
  })
})
