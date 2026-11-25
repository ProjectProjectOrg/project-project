import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import { ProjectSettingsLayout } from "@/features/projects/components/ProjectLayout"
import { mountProject } from "@/features/projects/lib/mountProject"

export const Route = createFileRoute(
  "/_authed/settings/orgs/$orgSlug/projects/$slug"
)({
  component: ProjectSettingsRoute,
  loader: ({ context, params }) => {
    const { orgSlug, slug } = params
    mountProject(context.registry, orgSlug, slug)
    return { crumb: Crumb.project({ orgSlug, slug }) }
  }
})

function ProjectSettingsRoute() {
  const { orgSlug, slug } = Route.useParams()
  return <ProjectSettingsLayout orgSlug={orgSlug} slug={slug} />
}
