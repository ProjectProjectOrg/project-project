import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { AboutTab } from "@/features/projects/components/AboutTab"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/about"
)({
  component: AboutTab,
  loader: () => ({
    crumb: Crumb.static({ label: m.project_detail_tab_about() })
  })
})
