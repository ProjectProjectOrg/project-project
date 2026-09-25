import { useAtomValue } from "@effect/atom-react"
import type { TicketCounts } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useState } from "react"

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
  const countsKey = viewCounts({
    ...source,
    query: { ...source.query, status: undefined }
  })
  const [previous, setPrevious] = useState<
    Readonly<{ key: typeof countsKey; value: TicketCounts }> | undefined
  >()
  if (
    Result.isSuccess(result) &&
    (previous?.key !== countsKey || previous.value !== result.value)
  ) {
    setPrevious({ key: countsKey, value: result.value })
  }
  const counts =
    Result.isInitial(result) && previous?.key === countsKey
      ? Result.success(previous.value)
      : result
  const statusesResult = useAtomValue(
    statusesFor(statusesRequest(source.orgSlug, source.slug))
  )
  const statuses = Result.isSuccess(statusesResult)
    ? boardStatusesFor(statusesResult.value)
    : []
  return Result.map(counts, (value) => {
    const byStatus: Record<string, number> = value.byStatus
    return {
      all: value.total,
      ...Object.fromEntries(
        statuses.map((status) => [status, byStatus[status] ?? 0])
      )
    }
  })
}
