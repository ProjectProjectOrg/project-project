import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { SlackIntegrationPage } from "@/features/slack/components/SlackIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/integrations/slack"
)({
  component: SlackIntegrationPage,
  loader: () => ({
    crumb: Crumb.static({ label: m.slack_heading() })
  })
})
