import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useRef, type ReactNode } from "react"
import { X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Empty, EmptyDescription } from "@/components/ui/empty"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  ticketsListAtom,
  ticketsListKey,
  type TicketsListValue
} from "@/atoms/tickets"
import type {
  Group,
  Member,
  Ticket,
  TicketId,
  TicketListQuery
} from "@projectproject/shared"
import { FilteredList } from "./FilteredList"
import { Toolbar } from "./Toolbar"
import { useResetTicketSearch } from "./url"

const EMPTY_BORDER = "border border-dashed border-border"

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
  const resetFilters = useResetTicketSearch()

  const previousListRef = useRef<TicketsListValue | null>(null)
  if (Result.isSuccess(list)) {
    previousListRef.current = list.value
  }

  const hasActiveFilter =
    (query.filter !== undefined && Object.keys(query.filter).length > 0) ||
    (query.q !== undefined && query.q.length > 0)

  const renderList = (value: TicketsListValue, waiting: boolean) => (
    <FilteredList
      orgSlug={orgSlug}
      slug={slug}
      listKey={listKey}
      items={value.items}
      nextCursor={value.nextCursor}
      waiting={waiting}
      members={members}
      extraRowActions={extraRowActions}
      sprintMembership={sprintMembership}
      hasActiveFilter={hasActiveFilter}
    />
  )

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
          onInitial: () =>
            previousListRef.current !== null ? (
              renderList(previousListRef.current, true)
            ) : (
              <div className="skeleton h-24 rounded-xl border border-border bg-background" />
            ),
          onError: (error) => (
            <Empty
              variant="inline"
              className={cn(EMPTY_BORDER, "gap-3 rounded-xl px-4 py-6")}
            >
              <EmptyDescription>
                {error._tag === "MalformedQuery"
                  ? m.tickets_list_malformed_query()
                  : m.tickets_list_load_error({ error: error._tag })}
              </EmptyDescription>
              <Button
                type="button"
                variant="tertiary"
                size="xs"
                leadingIcon={X}
                onClick={resetFilters}
              >
                {m.tickets_filters_clear_all()}
              </Button>
            </Empty>
          ),
          onDefect: (defect) => (
            <Empty variant="inline" className={EMPTY_BORDER}>
              {m.tickets_list_defect({ defect: String(defect) })}
            </Empty>
          ),
          onSuccess: ({ value, waiting }) => renderList(value, waiting === true)
        })}
      </div>
    </div>
  )
}
