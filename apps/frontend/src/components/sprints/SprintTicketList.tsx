import type { Member, Ticket, TicketListQuery } from "@pp/shared"
import { useCallback, type ReactNode } from "react"

import { TicketList } from "@/components/TicketList"
import { TicketRowActions } from "@/components/TicketList/RowActions"
import { SprintListToolbar } from "@/components/TicketList/toolbars"

export function SprintTicketList({
  orgSlug,
  slug,
  query,
  onQueryChange,
  members,
  creator
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  members: ReadonlyArray<Member>
  creator: ReactNode
}) {
  const rowActions = useCallback(
    (ticket: Ticket) => (
      <TicketRowActions
        orgSlug={orgSlug}
        slug={slug}
        id={ticket.id}
        archived={ticket.archivedAt !== null}
      />
    ),
    [orgSlug, slug]
  )
  return (
    <TicketList
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={members}
      creator={creator}
      extraRowActions={rowActions}
      toolbar={
        <SprintListToolbar
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          onQueryChange={onQueryChange}
          members={members}
        />
      }
    />
  )
}
