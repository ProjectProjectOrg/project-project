import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { TicketPagination } from "@/components/TicketList/SectionList"
import { Button } from "@/components/ui/button"
import {
  loadMoreMyTickets,
  type OrgTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import { keepInPlace } from "@/lib/keepInPlace"
import { m } from "@/paraglide/messages"

type MyTicketsPaginationProps = Readonly<{
  req: OrgTicketsRequest
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
      {Result.matchWithError(state, {
        onInitial: () => null,
        onSuccess: () => null,
        onError: (error) => (
          <ErrorPage error={error} reset={() => loadMore()} contained />
        ),
        onDefect: (defect) => (
          <ErrorPage error={defect} reset={() => loadMore()} contained />
        )
      })}
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
