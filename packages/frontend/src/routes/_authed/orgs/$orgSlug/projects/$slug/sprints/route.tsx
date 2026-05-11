import { createFileRoute } from "@tanstack/react-router"
import { SprintsLayout } from "@/components/sprints/SprintsLayout"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/sprints"
)({
  component: SprintsTab,
  loader: () => ({
    crumb: { type: "static" as const, label: m.project_detail_tab_sprints() }
  })
})

function SprintsTab() {
  const { orgSlug, slug } = Route.useParams()
  return <SprintsLayout orgSlug={orgSlug} slug={slug} />
}
