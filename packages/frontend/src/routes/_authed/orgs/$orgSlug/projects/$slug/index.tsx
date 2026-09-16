import { projectAtom } from "@/atoms/projects"
import { projectStatusesAtom } from "@/atoms/projectStatuses"
import { sprintsListAtom, projectKey } from "@/atoms/sprints"
import { ticketsSectionsAtom, ticketsSectionsKey } from "@/atoms/tickets"
import { createFileRoute } from "@tanstack/react-router"
import {
  ticketListQueryFromSearch,
  ticketListQueryToSearch
} from "@projectproject/shared"

type BacklogRouteSearch = ReturnType<typeof ticketListQueryToSearch> & {
  view?: "list" | "board"
}

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: () => null,
  loaderDeps: ({ search }) => ticketListQueryFromSearch(search),
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
  validateSearch: (search: Record<string, unknown>): BacklogRouteSearch => {
    const sanitized = ticketListQueryToSearch(ticketListQueryFromSearch(search))
    if (search.view !== "board" && search.view !== "list") return sanitized
    return { ...sanitized, view: search.view }
  }
})
