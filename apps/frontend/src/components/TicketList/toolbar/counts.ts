import { useAtomValue } from "@effect/atom-react"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { boardStatusesFor } from "@/components/sprints/board-utils"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  viewCounts,
  type ViewCountsSource
} from "@/features/tickets/atoms/viewCounts"

export function useViewTicketCounts(source: ViewCountsSource) {
  const result = useAtomValue(viewCounts(source))
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(source.orgSlug, source.slug))
  )
  const statuses = Result.isSuccess(statusesResult)
    ? boardStatusesFor(statusesResult.value)
    : []
  return Result.map(result, (counts) => {
    const byStatus: Record<string, number> = counts.byStatus
    return {
      all: counts.total,
      ...Object.fromEntries(
        statuses.map((status) => [status, byStatus[status] ?? 0])
      )
    }
  })
}
