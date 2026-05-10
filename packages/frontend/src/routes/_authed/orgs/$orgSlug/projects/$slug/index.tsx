import { useAtomValue } from "@effect-atom/atom-react"
import { createFileRoute } from "@tanstack/react-router"
import { TicketList } from "@/components/TicketList"
import { projectKey, sprintMembershipAtom } from "@/atoms/sprints"
import { useProject } from "./-context"

export const Route = createFileRoute("/_authed/orgs/$orgSlug/projects/$slug/")({
  component: TicketsTab,
  validateSearch: (
    search: Record<string, unknown>
  ): { ticket?: string; focusBody?: number } => ({
    ticket: typeof search.ticket === "string" ? search.ticket : undefined,
    focusBody: search.focusBody === 1 ? 1 : undefined
  })
})

function TicketsTab() {
  const { orgSlug, slug } = Route.useParams()
  const project = useProject()
  const sprintMembership = useAtomValue(
    sprintMembershipAtom(projectKey(orgSlug, slug))
  )
  return (
    <TicketList
      orgSlug={orgSlug}
      slug={slug}
      members={project.members}
      sprintMembership={sprintMembership}
    />
  )
}
