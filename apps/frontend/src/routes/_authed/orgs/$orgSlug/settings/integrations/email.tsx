import { createFileRoute } from "@tanstack/react-router"

import { EmailSettings } from "@/features/organizations/components/EmailSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/email"
)({
  component: EmailSettings,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_email_heading() }
  })
})
