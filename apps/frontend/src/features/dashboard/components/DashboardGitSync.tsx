import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectGitStatePolling } from "@/features/github/hooks/useProjectGitStatePolling"
import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  myTickets,
  myTicketsByProject,
  myTicketsByProjectRequest,
  myTicketsRequest,
  recentTickets,
  recentTicketsRequest
} from "@/features/tickets/atoms/myTickets"

export function DashboardGitSync({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const mine = useAtomValue(myTickets(myTicketsRequest(orgSlug)))
  const recent = useAtomValue(recentTickets(recentTicketsRequest(orgSlug)))
  const byProject = useAtomValue(
    myTicketsByProject(myTicketsByProjectRequest(orgSlug))
  )
  const slugs = new Set([
    ...[mine, recent].flatMap((result) =>
      Result.isSuccess(result)
        ? result.value.tickets.map((item) => item.project.slug)
        : []
    ),
    ...(Result.isSuccess(byProject)
      ? byProject.value.groups.map((group) => group.project.slug)
      : [])
  ])
  return [...slugs].map((slug) => (
    <ProjectGitSync key={slug} orgSlug={orgSlug} slug={slug} />
  ))
}

function ProjectGitSync({
  orgSlug,
  slug
}: Readonly<{ orgSlug: string; slug: string }>) {
  const detail = useAtomValue(project(projectRequest(orgSlug, slug)))
  const connected = Result.isSuccess(detail) && detail.value.github !== null
  useProjectGitStatePolling(orgSlug, slug, connected)
  return null
}
