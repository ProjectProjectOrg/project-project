import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { useCallback, useMemo } from "react"
import type { Ticket, TicketId, TicketListQuery } from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { BacklogToolbar } from "@/components/TicketList/toolbars"
import { ArchiveTicketControl } from "@/components/TicketList/ArchiveControl"
import { PageContainer } from "@/components/page"
import { sprintListRequest, sprintMembership } from "@/atoms/sprintList"
import {
  archiveTicket,
  ticketRequest,
  unarchiveTicket
} from "@/atoms/ticketDetail"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

function ArchiveRowAction({
  orgSlug,
  slug,
  ticketId,
  archived
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  archived: boolean
}) {
  const req = useMemo(
    () => ticketRequest(orgSlug, slug, ticketId),
    [orgSlug, slug, ticketId]
  )
  const archiveTicketSet = useAtomSet(archiveTicket(req), {
    mode: "promiseExit"
  })
  const archiveState = useAtomValue(archiveTicket(req))
  const unarchiveTicketSet = useAtomSet(unarchiveTicket(req))
  const unarchiveState = useAtomValue(unarchiveTicket(req))
  return (
    <ArchiveTicketControl
      archived={archived}
      onArchive={archiveTicketSet}
      onUnarchive={unarchiveTicketSet}
      waiting={archived ? unarchiveState.waiting : archiveState.waiting}
      failed={
        archived
          ? Result.isFailure(unarchiveState)
          : Result.isFailure(archiveState)
      }
    />
  )
}

export function BacklogView({
  orgSlug,
  slug,
  query,
  onQueryChange
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
}) {
  const project = useProject()
  const sprintReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const membershipResult = useAtomValue(sprintMembership(sprintReq))
  const membership = Result.isSuccess(membershipResult)
    ? membershipResult.value
    : undefined
  const rowActions = useCallback(
    (ticket: Ticket) => (
      <ArchiveRowAction
        orgSlug={orgSlug}
        slug={slug}
        ticketId={ticket.id}
        archived={ticket.archivedAt !== null}
      />
    ),
    [orgSlug, slug]
  )
  return (
    <PageContainer>
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        members={project.members}
        sprintMembership={membership}
        toolbar={
          <BacklogToolbar
            onQueryChange={onQueryChange}
            orgSlug={orgSlug}
            slug={slug}
            query={query}
            members={project.members}
          />
        }
        extraRowActions={rowActions}
      />
    </PageContainer>
  )
}
