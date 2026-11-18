import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { FigmaIntegrationPage } from "@/features/figma/components/FigmaIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/figma"
)({
  component: FigmaIntegrationPage,
  loader: () => ({
    crumb: Crumb.static({ label: m.figma_project_title() })
  })
})
