import { createFileRoute } from "@tanstack/react-router"

import { ProjectHeaderLayout } from "@/features/projects/components/ProjectHeaderLayout"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { withoutEpicsByDefault } from "@/features/tickets/lib/ticketRows"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader"
)({
  component: ProjectHeaderLayout,
  loader: ({ context: { registry }, params: { orgSlug, slug } }) => {
    registry.mount(
      ticketCounts(countsRequest(orgSlug, slug, withoutEpicsByDefault({})))
    )()
  }
})
