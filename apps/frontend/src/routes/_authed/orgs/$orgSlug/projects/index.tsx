import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/Breadcrumbs"
import { Projects } from "@/features/projects/components/Projects"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/")({
  component: Projects,
  loader: ({ params }) => ({
    crumb: Crumb.static({
      label: m.chrome_sidebar_projects(),
      to: "/orgs/$orgSlug/projects",
      params: { orgSlug: params.orgSlug }
    })
  })
})
