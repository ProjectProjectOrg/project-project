import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  estimationUnit,
  finishedStatusSlugs,
  summarizeEstimates,
  type EstimateUnit,
  type GroupId
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardRequest, sprintBoard } from "@/features/sprints/atoms/sprintBoard"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { formatEstimateSummary } from "@/features/tickets/lib/estimateMeta"
import { cn } from "@/lib/utils"

type SprintEstimateTotalsProps = Readonly<{
  groupId: GroupId
}>

export function SprintEstimateTotals(props: SprintEstimateTotalsProps) {
  const unit = estimationUnit(useEstimationMode())
  return unit === null ? null : <SprintEstimateSummary {...props} unit={unit} />
}

function SprintEstimateSummary({
  groupId,
  unit
}: SprintEstimateTotalsProps & Readonly<{ unit: EstimateUnit }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = boardRequest(orgSlug, slug, groupId)
  const board = useAtomValue(sprintBoard(req))
  const refresh = useAtomRefresh(sprintBoard(req))
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const finished = finishedStatusSlugs(
    Result.isSuccess(statuses) ? statuses.value : []
  )
  return (
    <AsyncView
      result={board}
      contained
      reset={refresh}
      onInitial={() => null}
      onSuccess={({ value, waiting }) => {
        const text = formatEstimateSummary(
          summarizeEstimates(value.tickets, unit, finished)
        )
        return text === null ? null : (
          <span className={cn("tabular-nums", waiting && "animate-pulse")}>
            {text}
          </span>
        )
      }}
    />
  )
}
