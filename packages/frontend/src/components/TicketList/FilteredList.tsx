import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { type ReactNode } from "react"
import { FilterX, ListChecks, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import { loadMoreTicketsAtom } from "@/atoms/tickets"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import type { Group, Member, Ticket, TicketId } from "@projectproject/shared"
import { Row } from "./Row"
import { useResetTicketSearch } from "./url"

export function FilteredList({
  orgSlug,
  slug,
  listKey,
  items,
  nextCursor,
  waiting,
  members,
  extraRowActions,
  sprintMembership,
  hasActiveFilter
}: {
  orgSlug: string
  slug: string
  listKey: string
  items: ReadonlyArray<Ticket>
  nextCursor: string | null
  waiting: boolean
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  hasActiveFilter: boolean
}) {
  const loadMore = useAtomSet(loadMoreTicketsAtom(listKey))
  const loadMoreState = useAtomValue(loadMoreTicketsAtom(listKey))
  const loadingMore = loadMoreState.waiting
  const resetFilters = useResetTicketSearch()

  if (items.length === 0) {
    if (hasActiveFilter) {
      return (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <FilterX strokeWidth={1.75} />
            </EmptyMedia>
            <EmptyTitle>{m.tickets_no_filter_matches_title()}</EmptyTitle>
            <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button
              type="button"
              variant="tertiary"
              size="sm"
              leadingIcon={FilterX}
              onClick={resetFilters}
            >
              {m.tickets_filters_clear_all()}
            </Button>
          </EmptyContent>
        </Empty>
      )
    }
    return <NoTicketsYet />
  }

  const showSprintCol =
    sprintMembership !== undefined &&
    items.some((t) => sprintMembership.get(t.id) !== undefined)
  const showExtraActionsCol = extraRowActions !== undefined
  const gridCols = cn(
    "grid divide-y divide-border rounded-xl border border-border bg-background",
    showExtraActionsCol
      ? "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto_auto]"
      : "grid-cols-[auto_auto_auto_minmax(0,1fr)_auto]",
    waiting && "animate-pulse"
  )

  return (
    <div className="flex flex-col gap-3">
      <ul className={gridCols}>
        {items.map((t) => {
          const membership = sprintMembership?.get(t.id) ?? null
          return (
            <li key={t.id} className="col-span-full grid grid-cols-subgrid">
              <Row
                orgSlug={orgSlug}
                slug={slug}
                ticket={t}
                members={members}
                showSprintCol={showSprintCol}
                showExtraActionsCol={showExtraActionsCol}
                sprintMembership={membership}
                extraRowActions={extraRowActions}
              />
            </li>
          )
        })}
      </ul>
      {nextCursor !== null && (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => loadMore()}
          disabled={loadingMore}
          className="self-center"
        >
          {loadingMore ? (
            <>
              <Loader2 className="size-4 animate-spin" strokeWidth={1.75} />
              {m.tickets_load_more_loading()}
            </>
          ) : (
            m.tickets_load_more_button()
          )}
        </Button>
      )}
    </div>
  )
}

function NoTicketsYet() {
  return (
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ListChecks strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.tickets_empty_title()}</EmptyTitle>
        <EmptyDescription>
          {m.tickets_empty_hint_prefix()}{" "}
          <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
