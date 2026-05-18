import { createFileRoute } from "@tanstack/react-router"
import { ticketListQueryFromSearch } from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { PageContainer } from "@/components/page"
import { useProject } from "./-context"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: TicketsTab,
  validateSearch: ticketListQueryFromSearch
})

function TicketsTab() {
  const { orgSlug, slug } = Route.useParams()
  const query = Route.useSearch()
  const project = useProject()
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
