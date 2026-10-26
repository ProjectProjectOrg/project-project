import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import {
  loadMoreMyTickets,
  type MyTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import { TicketPagination } from "@/features/tickets/components/ticket-list/SectionList"
import { keepInPlace } from "@/lib/keepInPlace"
import { m } from "@/paraglide/messages"

type MyTicketsPaginationProps = Readonly<{
  req: MyTicketsRequest
  nextCursor: string | null
  loaded: number
  total: number
}>

export function MyTicketsPagination({
  req,
  nextCursor,
  loaded,
  total
}: MyTicketsPaginationProps) {
  const loadMore = useAtomSet(loadMoreMyTickets(req))
  const state = useAtomValue(loadMoreMyTickets(req))
  return (
    <>
      <AsyncView
        result={state}
        contained
        reset={() => loadMore()}
        onInitial={() => null}
        onSuccess={() => null}
      />
      <TicketPagination
        requestKey={req.params.orgSlug}
        nextCursor={nextCursor}
        remaining={Math.max(0, total - loaded)}
        collapsed={false}
        loadingMore={state.waiting}
        failed={Result.isFailure(state)}
        loadMore={() => loadMore()}
      />
    </>
  )
}

export const COMPACT_TICKET_LIMIT = 5

export function ShowLessButton({
  onCollapse
}: Readonly<{ onCollapse: () => void }>) {
  return (
    <div className="flex justify-center py-2">
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        onClick={(e) =>
          keepInPlace(
            e.currentTarget.closest("section") ?? e.currentTarget,
            onCollapse,
            "bottom"
          )
        }
      >
        {m.org_dashboard_show_less()}
      </Button>
    </div>
  )
}

export function RevealMoreButton({
  remaining,
  onReveal
}: Readonly<{ remaining: number; onReveal: () => void }>) {
  return (
    <div className="flex justify-center py-2">
      <Button type="button" variant="tertiary" size="sm" onClick={onReveal}>
        {m.tickets_section_load_more_button({ remaining })}
      </Button>
    </div>
  )
}
