import type { ReactNode } from "react"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SegmentedList } from "./SegmentedList"
import { Toolbar } from "./Toolbar"
import { queryHasActiveFilter } from "./url"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery
} from "@projectproject/shared"

export function TicketList({
  orgSlug,
  slug,
  query,
  members,
  extraRowActions,
  sprintMembership,
  creator,
  showSprintFilter
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  creator?: ReactNode
  showSprintFilter?: boolean
}) {
  const hasActiveFilter = queryHasActiveFilter(query)

  return (
    <div className="group/list flex flex-col gap-3">
      {creator ?? (
        <BacklogTicketCreator orgSlug={orgSlug} slug={slug} query={query} />
      )}

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        <Toolbar
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={members}
          showSprintFilter={showSprintFilter}
        />

        <SegmentedList
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={members}
          extraRowActions={extraRowActions}
          sprintMembership={sprintMembership}
          hasActiveFilter={hasActiveFilter}
        />
      </div>
    </div>
  )
}
