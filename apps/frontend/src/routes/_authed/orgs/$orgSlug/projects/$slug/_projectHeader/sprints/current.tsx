import { createFileRoute } from "@tanstack/react-router"

import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { CurrentSprintRedirect } from "@/features/sprints/components/CurrentSprintRedirect"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/current"
)({
  component: CurrentSprintRedirect,
  loader: ({ context: { registry }, params: { orgSlug, slug } }) => {
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
  }
})
