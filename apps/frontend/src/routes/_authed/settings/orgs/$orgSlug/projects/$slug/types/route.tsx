import { createFileRoute, Outlet } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug/types"
)({
  component: Outlet,
  loader: () => ({
    crumb: Crumb.static({ label: m.project_settings_types_tab() })
  })
})
