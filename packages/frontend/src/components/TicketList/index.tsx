import { Result, useAtomValue } from "@effect-atom/atom-react"
import { type ReactNode } from "react"
import { Empty } from "@/components/ui/empty"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { m } from "@/paraglide/messages"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import { ticketListUiKey } from "@/atoms/ticketListUi"
import type { Group, Member, TicketId } from "@projectproject/shared"
import type { Ticket } from "@projectproject/shared"
import { FilteredList } from "./FilteredList"
import { Toolbar } from "./Toolbar"

export function TicketList({
  orgSlug,
  slug,
  members,
  uiKey,
  filterIds,
  extraRowActions,
  sprintMembership,
  creator,
  showSprintFilter
}: {
  orgSlug: string
  slug: string
  members: ReadonlyArray<Member>
  uiKey?: string
  filterIds?: ReadonlySet<TicketId>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  creator?: ReactNode
  showSprintFilter?: boolean
}) {
  const resolvedUiKey = uiKey ?? ticketListUiKey(orgSlug, slug)
  const list = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))

  return (
    <div className="group/list flex flex-col gap-3">
      {creator ?? <BacklogTicketCreator orgSlug={orgSlug} slug={slug} />}

      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        {Result.isSuccess(list) && list.value.length > 0 && (
          <Toolbar
            orgSlug={orgSlug}
            slug={slug}
            uiKey={resolvedUiKey}
            tickets={list.value}
            members={members}
            showSprintFilter={showSprintFilter}
          />
        )}

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
          onSuccess: ({ value }) => (
            <FilteredList
              orgSlug={orgSlug}
              slug={slug}
              uiKey={resolvedUiKey}
              tickets={
                filterIds ? value.filter((t) => filterIds.has(t.id)) : value
              }
              members={members}
              extraRowActions={extraRowActions}
              sprintMembership={sprintMembership}
            />
          )
        })}
      </div>
    </div>
  )
}
