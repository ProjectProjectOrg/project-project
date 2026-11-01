import { createFileRoute } from "@tanstack/react-router"

import { WebhookDetail } from "@/features/webhooks/components/WebhookDetail"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/settings/webhooks/$webhookId"
)({
  component: WebhookDetailRoute
})

function WebhookDetailRoute() {
  const { webhookId } = Route.useParams()
  return <WebhookDetail webhookId={webhookId} />
}
