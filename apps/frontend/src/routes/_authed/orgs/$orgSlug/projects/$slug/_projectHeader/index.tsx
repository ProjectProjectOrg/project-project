import { TicketListQuery } from "@pp/shared"
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
import { epicsRequest, openEpicTitles } from "@/features/tickets/atoms/epics"
import {
  sprintSections,
  sprintSectionsRequest
} from "@/features/tickets/atoms/sprintSections"
import { readBacklogGrouping } from "@/features/tickets/components/ticket-list/ProjectTicketLayout"
import { readViewPreference } from "@/hooks/useViewPreference"

const BacklogRouteSearchSchema = TicketListQuery.pipe(
  Schema.fieldsAssign({
    view: Schema.optional(Schema.Literals(["list", "board"]))
  })
)

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/"
)({
  component: () => null,
  loaderDeps: ({ search }) => search,
  loader: ({
    context: { registry },
    params: { orgSlug, slug },
    deps: query
  }) => {
    registry.mount(project(projectRequest(orgSlug, slug)))()
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
    registry.mount(openEpicTitles(epicsRequest(orgSlug, slug)))()
    const viewerId = registry.get(currentUserId)
    const view = query.view ?? readViewPreference(orgSlug, slug, "backlog")
    const grouping =
      view === "board"
        ? "status"
        : viewerId === undefined
          ? undefined
          : readBacklogGrouping(viewerId, orgSlug, slug)
    if (grouping !== "sprint") {
      registry.mount(backlog(backlogRequest(orgSlug, slug, query)))()
    }
    if (grouping !== "status") {
      registry.mount(
        sprintSections(sprintSectionsRequest(orgSlug, slug, query))
      )()
    }
  },
  validateSearch: Schema.toStandardSchemaV1(BacklogRouteSearchSchema)
})
