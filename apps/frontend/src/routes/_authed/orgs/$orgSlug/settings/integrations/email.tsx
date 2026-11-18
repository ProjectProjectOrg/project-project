import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { EmailSettings } from "@/features/organizations/components/EmailSettings"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/email"
)({
  component: EmailSettings,
  loader: () => ({
    crumb: Crumb.static({ label: m.org_email_heading() })
  })
})
