import { createFileRoute } from "@tanstack/react-router"

import { WebhooksSettings } from "@/features/webhooks/components/WebhooksSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/webhooks/"
)({
  component: WebhooksSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.webhooks_tab() }
  })
})
