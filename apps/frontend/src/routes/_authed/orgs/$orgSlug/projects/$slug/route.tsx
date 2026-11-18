import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { ProjectLayout } from "@/features/projects/components/ProjectLayout"
import { mountProject } from "@/features/projects/lib/mountProject"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug")({
  component: ProjectRoute,
  loader: ({ context, params }) => {
    const { orgSlug, slug } = params
    mountProject(context.registry, orgSlug, slug)
    return {
      crumb: [
        Crumb.static({
          label: m.chrome_sidebar_projects(),
          to: "/orgs/$orgSlug/projects",
          params: { orgSlug }
        }),
        Crumb.project({ orgSlug, slug })
      ]
    }
  }
})

function ProjectRoute() {
  const { orgSlug, slug } = Route.useParams()
  return <ProjectLayout orgSlug={orgSlug} slug={slug} />
}
