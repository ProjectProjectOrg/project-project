import { useAtomSet, useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { ErrorPage } from "@/components/ErrorPage"
import { TicketPagination } from "@/components/TicketList/SectionList"
import {
  loadMoreMyTickets,
  type OrgTicketsRequest
} from "@/features/tickets/atoms/myTickets"

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
