import { createFileRoute } from "@tanstack/react-router"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintsIndex } from "@/features/sprints/components/SprintsIndex"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/"
)({
  component: SprintsIndex,
  loader: ({ context: { registry }, params: { orgSlug, slug } }) => {
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
  }
})
