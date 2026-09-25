import type { Member, Ticket, TicketListQuery } from "@pp/shared"
import { useCallback } from "react"

import { TicketListContent } from "@/components/TicketList"
import { TicketRowActions } from "@/components/TicketList/RowActions"

export function SprintTicketList({
  orgSlug,
  slug,
  query,
  members
}: Readonly<{
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
}>) {
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
    <TicketListContent
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={members}
      extraRowActions={rowActions}
    />
  )
}
