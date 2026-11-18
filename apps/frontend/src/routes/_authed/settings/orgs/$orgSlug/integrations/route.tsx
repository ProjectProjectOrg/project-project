import { createFileRoute, Outlet } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/integrations"
)({
  component: Outlet,
  loader: () => ({
    crumb: Crumb.static({ label: m.org_settings_integrations_tab() })
  })
})
