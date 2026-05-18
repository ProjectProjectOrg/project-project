import { Result, useAtomValue } from "@effect-atom/atom-react"
import { type ReactNode } from "react"
import { Empty } from "@/components/ui/empty"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { m } from "@/paraglide/messages"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery
} from "@projectproject/shared"
import { FilteredList } from "./FilteredList"
import { Toolbar } from "./Toolbar"

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
  const listKey = ticketsListKey(orgSlug, slug, query)
  const list = useAtomValue(ticketsListAtom(listKey))

  return (
    <div className="group/list flex flex-col gap-3">
      {creator ?? <BacklogTicketCreator orgSlug={orgSlug} slug={slug} />}

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        <Toolbar
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={members}
          showSprintFilter={showSprintFilter}
        />

        {Result.matchWithError(list, {
          onInitial: () => (
            <div className="skeleton h-24 rounded-xl border border-border bg-background" />
          ),
          onError: (error) => (
            <Empty variant="inline" className="border border-dashed border-border">
              {m.tickets_list_load_error({ error: error._tag })}
            </Empty>
          ),
          onDefect: (defect) => (
            <Empty variant="inline" className="border border-dashed border-border">
              {m.tickets_list_defect({ defect: String(defect) })}
            </Empty>
          ),
          onSuccess: ({ value, waiting }) => (
            <FilteredList
              orgSlug={orgSlug}
              slug={slug}
              listKey={listKey}
              items={value.items}
              nextCursor={value.nextCursor}
              waiting={waiting === true}
              members={members}
              extraRowActions={extraRowActions}
              sprintMembership={sprintMembership}
              hasActiveFilter={
                (query.filter !== undefined &&
                  Object.keys(query.filter).length > 0) ||
                (query.q !== undefined && query.q.length > 0)
              }
            />
          )
        })}
      </div>
    </div>
  )
}
