import { createFileRoute } from "@tanstack/react-router"

import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { ProjectLayout } from "@/features/projects/components/ProjectLayout"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { m } from "@/paraglide/messages"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug")({
  component: ProjectLayout,
  loader: ({ context, params }) => {
    const { orgSlug, slug } = params
    const { registry } = context
    registry.mount(project(projectRequest(orgSlug, slug)))()
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
    return {
      crumb: [
        {
          type: "static" as const,
          label: m.chrome_sidebar_projects(),
          to: "/orgs/$orgSlug/projects",
          params: { orgSlug }
        },
        {
          type: "project" as const,
          orgSlug,
          slug
        }
      ]
    }
  }
})
