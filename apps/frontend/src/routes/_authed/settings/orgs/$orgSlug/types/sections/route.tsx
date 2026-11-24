import { createFileRoute, Outlet } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/types/sections"
)({
  component: Outlet,
  loader: () => ({
    crumb: Crumb.static({ label: m.templates_types_tab_sections() })
  })
})
