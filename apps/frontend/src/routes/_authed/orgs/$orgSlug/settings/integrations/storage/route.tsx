import { createFileRoute, Outlet } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/storage"
)({
  component: Outlet,
  loader: () => ({
    crumb: Crumb.static({ label: m.storage_crumb() })
  })
})
