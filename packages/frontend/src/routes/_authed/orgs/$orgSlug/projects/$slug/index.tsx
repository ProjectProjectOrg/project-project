import { createFileRoute } from "@tanstack/react-router"
import {
  ticketListQueryFromSearch,
  ticketListQueryToSearch
} from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { PageContainer } from "@/components/page"
import { useProject } from "./-context"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: TicketsTab,
  validateSearch: (search: Record<string, unknown>) =>
    ticketListQueryToSearch(ticketListQueryFromSearch(search))
})

function TicketsTab() {
  const { orgSlug, slug } = Route.useParams()
  const search = Route.useSearch()
  const project = useProject()
  const query = ticketListQueryFromSearch(search as Record<string, unknown>)
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
