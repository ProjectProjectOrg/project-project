import { project, projectRequest } from "@/atoms/projects"
import { statusesFor, statusesRequest } from "@/atoms/projectStatuses"
import { sprintList, sprintListRequest } from "@/atoms/sprintList"
import { backlog, backlogRequest } from "@/atoms/backlog"
import { sprintSections, sprintSectionsRequest } from "@/atoms/sprintSections"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { TicketListQuery } from "@projectproject/shared"

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
