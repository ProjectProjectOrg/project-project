import { createFileRoute, Outlet } from "@tanstack/react-router"

import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations"
)({
  component: Outlet,
  loader: () => ({
    crumb: { type: "static" as const, label: m.org_settings_integrations_tab() }
  })
})
