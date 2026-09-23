import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { project, projectRequest } from "@/features/projects/atoms/projects"
import {
  myTickets,
  orgTicketsRequest,
  recentTickets
} from "@/features/tickets/atoms/myTickets"
import { useProjectGitStatePolling } from "@/hooks/useProjectGitStatePolling"

export function DashboardGitSync({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const req = orgTicketsRequest(orgSlug)
  const mine = useAtomValue(myTickets(req))
  const recent = useAtomValue(recentTickets(req))
  const slugs = new Set(
    [mine, recent].flatMap((result) =>
      Result.isSuccess(result)
        ? result.value.tickets.map((item) => item.project.slug)
        : []
    )
  )
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
