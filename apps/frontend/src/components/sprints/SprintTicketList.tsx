import type { Member, TicketListQuery } from "@pp/shared"

import { TicketListContent } from "@/components/TicketList"

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
  return (
    <TicketListContent
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={members}
    />
  )
}
