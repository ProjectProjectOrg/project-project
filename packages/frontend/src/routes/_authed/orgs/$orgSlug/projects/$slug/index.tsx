import { createFileRoute } from "@tanstack/react-router"
import {
  DEFAULT_TICKET_SORT,
  ticketListQueryFromSearch,
  type TicketListQuery
} from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { PageContainer } from "@/components/page"
import { useProject } from "./-context"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: TicketsTab,
  validateSearch: (search: Record<string, unknown>): Partial<TicketListQuery> =>
    ticketListQueryFromSearch(search)
})

function TicketsTab() {
  const { orgSlug, slug } = Route.useParams()
  const search = Route.useSearch()
  const project = useProject()
  const query: TicketListQuery = {
    ...search,
    sort: search.sort ?? DEFAULT_TICKET_SORT
  }
  return (
    <PageContainer>
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        members={project.members}
        showSprintFilter
      />
    </PageContainer>
  )
}
