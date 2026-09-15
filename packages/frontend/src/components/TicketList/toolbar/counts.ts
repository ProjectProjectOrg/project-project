import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { useMemo } from "react"
import {
  projectKey as projectStatusKey,
  projectStatusesAtom
} from "@/atoms/projectStatuses"
import { countsRequest, ticketCounts } from "@/atoms/ticketCounts"
import { boardStatusesFor } from "@/components/sprints/board-utils"
import type { ProjectStatus, TicketListQuery } from "@projectproject/shared"
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
  const statusesResult = useAtomValue(
    projectStatusesAtom(projectStatusKey(orgSlug, slug))
  )
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
