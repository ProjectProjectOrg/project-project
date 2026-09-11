import { projectAtom } from "@/atoms/projects"
import { projectStatusesAtom } from "@/atoms/projectStatuses"
import { sprintsListAtom, projectKey } from "@/atoms/sprints"
import { ticketsSectionsAtom, ticketsSectionsKey } from "@/atoms/tickets"
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
    registry.mount(sprintsListAtom(key))()
    registry.mount(projectStatusesAtom(key))()
    registry.mount(
      ticketsSectionsAtom(ticketsSectionsKey(orgSlug, slug, query))
    )()
  },
  validateSearch: Schema.toStandardSchemaV1(TicketListQuery)
})
