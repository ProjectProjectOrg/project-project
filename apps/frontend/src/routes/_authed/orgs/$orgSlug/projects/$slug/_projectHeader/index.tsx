import { TicketListQuery } from "@pp/shared"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"

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
  sprintSections,
  sprintSectionsRequest
} from "@/features/tickets/atoms/sprintSections"

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
    registry.mount(backlog(backlogRequest(orgSlug, slug, query)))()
    registry.mount(
      sprintSections(sprintSectionsRequest(orgSlug, slug, query))
    )()
  },
  validateSearch: Schema.toStandardSchemaV1(BacklogRouteSearchSchema)
})
