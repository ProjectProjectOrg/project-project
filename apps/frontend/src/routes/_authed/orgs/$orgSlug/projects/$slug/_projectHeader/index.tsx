import { createFileRoute, redirect } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

import { currentUserId } from "@/features/auth/atoms/auth"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import {
  backlogFirstScreen,
  backlogGroupingFor
} from "@/features/tickets/atoms/backlogFirstScreen"
import { writeBacklogGrouping } from "@/features/tickets/components/ticket-list/ProjectTicketLayout"
import {
  BacklogSearch,
  ticketQueryFromSearch
} from "@/features/tickets/lib/ticketSearch"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"
)({
  component: () => null,
  beforeLoad: ({
    context: { registry },
    params: { orgSlug, slug },
    search,
    location,
    preload
  }) => {
    if (search.group === undefined || preload) return
    const viewerId = registry.get(currentUserId)
    if (viewerId !== undefined)
      writeBacklogGrouping(viewerId, orgSlug, slug, search.group)
    throw redirect({
      to: "/orgs/$orgSlug/projects/$slug",
      params: { orgSlug, slug },
      search: { ...search, group: undefined },
      hash: location.hash,
      replace: true
    })
  },
  loaderDeps: ({ search }) => search,
  loader: ({
    context: { registry },
    params: { orgSlug, slug },
    deps: search
  }) => {
    const query = ticketQueryFromSearch(search)
    registry.mount(project(projectRequest(orgSlug, slug)))()
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
    for (const atom of backlogFirstScreen(
      orgSlug,
      slug,
      query,
      backlogGroupingFor(
        registry.get(currentUserId),
        orgSlug,
        slug,
        search.view
      )
    ))
      registry.mount(atom)()
  },
  validateSearch: Schema.toStandardSchemaV1(BacklogSearch)
})
