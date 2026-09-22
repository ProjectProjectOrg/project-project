import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus, TicketListQuery } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"

import { boardStatusesFor } from "@/components/sprints/board-utils"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []

export function useServerTicketCounts(
  orgSlug: string,
  slug: string,
  query: TicketListQuery
): Record<string, number> {
  const req = useMemo(
    () => countsRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const countsResult = useAtomValue(ticketCounts(req))
  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const statuses: ReadonlyArray<ProjectStatus> = Result.isSuccess(
    statusesResult
  )
    ? statusesResult.value
    : EMPTY_STATUSES
  return useMemo<Record<string, number>>(() => {
    if (!Result.isSuccess(countsResult)) return { all: 0 }
    const byStatus = countsResult.value.byStatus as Record<string, number>
    const next: Record<string, number> = { all: countsResult.value.total }
    for (const s of boardStatusesFor(statuses)) {
      next[s] = byStatus[s] ?? 0
    }
    return next
  }, [countsResult, statuses])
}
