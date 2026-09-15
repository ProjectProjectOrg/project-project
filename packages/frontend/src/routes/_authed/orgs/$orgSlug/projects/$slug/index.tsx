import { projectAtom, projectKey } from "@/atoms/projects"
import { projectStatusesAtom } from "@/atoms/projectStatuses"
import { sprintList, sprintListRequest } from "@/atoms/sprintList"
import { backlog, backlogRequest } from "@/atoms/backlog"
import { createFileRoute } from "@tanstack/react-router"
import * as Schema from "effect/Schema"
import { TicketListQuery } from "@projectproject/shared"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: () => null,
  loaderDeps: ({ search }) => search,
  loader: ({
    context: { registry },
    params: { orgSlug, slug },
    deps: query
  }) => {
    const key = projectKey(orgSlug, slug)
    registry.mount(projectAtom(key))()
    registry.mount(sprintList(sprintListRequest(orgSlug, slug)))()
    registry.mount(projectStatusesAtom(key))()
    registry.mount(backlog(backlogRequest(orgSlug, slug, query)))()
  },
  validateSearch: Schema.toStandardSchemaV1(TicketListQuery)
})
