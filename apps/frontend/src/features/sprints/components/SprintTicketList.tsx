import type { Member, TicketListQuery } from "@pp/shared"

import { TicketListContent } from "@/features/tickets/components/ticket-list"

export function SprintTicketList({
  query,
  members
}: Readonly<{
  query: TicketListQuery
  members: ReadonlyArray<Member>
}>) {
  return <TicketListContent query={query} members={members} />
}
