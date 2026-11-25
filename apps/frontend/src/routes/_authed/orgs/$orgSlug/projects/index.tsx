import { createFileRoute } from "@tanstack/react-router"

import { Crumb } from "@/components/shell/crumb"
import {
  projectsFor,
  projectsRequest
} from "@/features/projects/atoms/projects"
import { Projects } from "@/features/projects/components/Projects"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/")({
  component: Projects,
  loader: ({ context: { registry }, params }) => {
    registry.mount(projectsFor(projectsRequest(params.orgSlug)))()
    return {
      crumb: Crumb.static({
        label: m.chrome_sidebar_projects(),
        to: "/orgs/$orgSlug/projects",
        params: { orgSlug: params.orgSlug }
      })
    }
  }
})
