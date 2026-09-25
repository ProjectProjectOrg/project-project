import { useAtomValue } from "@effect/atom-react"
import type { ProjectStatus, TicketCounts } from "@pp/shared"
import * as Option from "effect/Option"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo, useState } from "react"

import { boardStatusesFor } from "@/components/sprints/board-utils"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  viewCounts,
  type ViewCountsSource
} from "@/features/tickets/atoms/viewCounts"

const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []
const EMPTY_COUNTS: TicketCounts = { total: 0, byStatus: {} }

type RetainedCounts = Readonly<{
  scope: string
  counts: TicketCounts
}>

export function useViewTicketCounts(source: ViewCountsSource) {
  const { orgSlug, slug, groupId, view, grouping, query } = source
  const result = useAtomValue(
    useMemo(
      () => viewCounts({ orgSlug, slug, groupId, view, grouping, query }),
      [orgSlug, slug, groupId, view, grouping, query]
    )
  )
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
  const scope = `${orgSlug}/${slug}/${groupId ?? "backlog"}`
  const current = Option.getOrUndefined(Result.value(result))
  const [retained, setRetained] = useState<RetainedCounts>()
  if (current && (retained?.counts !== current || retained.scope !== scope)) {
    setRetained({ scope, counts: current })
  }
  const counts =
    current ??
    (Result.isFailure(result)
      ? EMPTY_COUNTS
      : retained?.scope === scope
        ? retained.counts
        : undefined)
  return useMemo(() => {
    if (!counts) return undefined
    const byStatus: Record<string, number> = counts.byStatus
    const next: Record<string, number> = { all: counts.total }
    for (const s of boardStatusesFor(statuses)) {
      next[s] = byStatus[s] ?? 0
    }
    return next
  }, [counts, statuses])
}
