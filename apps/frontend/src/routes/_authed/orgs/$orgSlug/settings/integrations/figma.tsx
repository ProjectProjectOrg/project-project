import { createFileRoute } from "@tanstack/react-router"

import { FigmaIntegrationPage } from "@/features/figma/components/FigmaIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/figma"
)({
  component: FigmaIntegrationPage,
  loader: () => ({
    crumb: { type: "static" as const, label: m.figma_project_title() }
  })
})
