import { createFileRoute } from "@tanstack/react-router"

import { AboutTab } from "@/features/projects/components/AboutTab"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/about"
)({
  component: AboutTab,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_detail_tab_about() }
  })
})
