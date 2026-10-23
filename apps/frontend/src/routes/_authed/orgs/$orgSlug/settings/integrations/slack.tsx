import { createFileRoute } from "@tanstack/react-router"

import { SlackIntegrationPage } from "@/features/slack/components/SlackIntegrationPage"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/slack"
)({
  component: SlackIntegrationPage,
  loader: () => ({
    crumb: { type: "static" as const, label: m.slack_heading() }
  })
})
