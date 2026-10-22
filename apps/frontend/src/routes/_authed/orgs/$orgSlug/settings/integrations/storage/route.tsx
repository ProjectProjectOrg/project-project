import { createFileRoute, Outlet } from "@tanstack/react-router"

import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/settings/integrations/storage"
)({
  component: Outlet,
  loader: () => ({
    crumb: { type: "static" as const, label: m.storage_crumb() }
  })
})
