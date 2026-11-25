import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { SprintsTab } from "@/features/sprints/components/SprintsTab"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints"
)({
  component: SprintsTab,
  loader: ({ params: { orgSlug, slug } }) => ({
    crumb: Crumb.static({
      label: m.project_detail_tab_sprints(),
      to: "/orgs/$orgSlug/projects/$slug/sprints",
      params: { orgSlug, slug }
    })
  })
})
