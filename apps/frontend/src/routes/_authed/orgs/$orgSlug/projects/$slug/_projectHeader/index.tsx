import { createFileRoute } from "@tanstack/react-router"
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
import { backlog, backlogRequest } from "@/features/tickets/atoms/backlog"
import {
  epicSections,
  epicSectionsRequest
} from "@/features/tickets/atoms/epicSections"
import {
  sprintSections,
  sprintSectionsRequest
} from "@/features/tickets/atoms/sprintSections"
import { readBacklogGrouping } from "@/features/tickets/components/ticket-list/ProjectTicketLayout"
import {
  BacklogSearch,
  ticketQueryFromSearch
} from "@/features/tickets/lib/ticketSearch"
import { readViewPreference } from "@/hooks/useViewPreference"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"
)({
  component: () => null,
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
    const viewerId = registry.get(currentUserId)
    const view = search.view ?? readViewPreference(orgSlug, slug, "backlog")
    const grouping =
      view === "board"
        ? "status"
        : viewerId === undefined
          ? undefined
          : readBacklogGrouping(viewerId, orgSlug, slug)
    if (grouping !== "sprint") {
      registry.mount(backlog(backlogRequest(orgSlug, slug, query)))()
    }
    if (grouping === "sprint") {
      registry.mount(
        sprintSections(sprintSectionsRequest(orgSlug, slug, query))
      )()
    }
    if (grouping === "epic" || grouping === "parent") {
      registry.mount(
        epicSections(epicSectionsRequest(orgSlug, slug, query, grouping))
      )()
    }
  },
  validateSearch: Schema.toStandardSchemaV1(BacklogSearch)
})
