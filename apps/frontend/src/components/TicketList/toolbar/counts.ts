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
  if (!Result.isSuccess(result) && !Result.isFailure(result)) return undefined

  const counts = Result.isSuccess(result)
    ? result.value
    : { total: 0, byStatus: {} }
  const statuses = Result.isSuccess(statusesResult)
    ? boardStatusesFor(statusesResult.value)
    : []
  const byStatus: Record<string, number> = counts.byStatus
  return {
    all: counts.total,
    ...Object.fromEntries(
      statuses.map((status) => [status, byStatus[status] ?? 0])
    )
  }
}
