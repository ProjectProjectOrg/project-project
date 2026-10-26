import type { Member, Ticket, TicketListQuery } from "@pp/shared"
import { useCallback } from "react"

import { TicketListContent } from "@/features/tickets/components/ticket-list"
import { TicketRowActions } from "@/features/tickets/components/ticket-list/RowActions"

export function SprintTicketList({
  query,
  members
}: Readonly<{
  query: TicketListQuery
  members: ReadonlyArray<Member>
}>) {
  const rowActions = useCallback(
    (ticket: Ticket) => (
      <TicketRowActions id={ticket.id} archived={ticket.archivedAt !== null} />
    ),
    []
  )
  return (
    <TicketListContent
      query={query}
      members={members}
      extraRowActions={rowActions}
    />
  )
}
