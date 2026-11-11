import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  estimationUnit,
  statusPhaseLookup,
  summarizeEstimates,
  type EstimateUnit,
  type Group
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
import { isEmptyEstimateSummary } from "@/features/tickets/lib/estimateMeta"
import { cn } from "@/lib/utils"

import { SprintProgress } from "./SprintProgress"

type SprintEstimateTotalsProps = Readonly<{
  sprint: Group
}>

export function SprintEstimateTotals(props: SprintEstimateTotalsProps) {
  const unit = estimationUnit(useEstimationMode())
  return unit === null ? null : <SprintEstimateSummary {...props} unit={unit} />
}

function SprintEstimateSummary({
  sprint,
  unit
}: SprintEstimateTotalsProps & Readonly<{ unit: EstimateUnit }>) {
  const { orgSlug, slug } = useProjectRoute()
  const req = boardRequest(orgSlug, slug, sprint.id)
  const board = useAtomValue(sprintBoard(req))
  const refresh = useAtomRefresh(sprintBoard(req))
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const phaseOf = statusPhaseLookup(
    Result.isSuccess(statuses) ? statuses.value : []
  )
  return (
    <AsyncView
      result={board}
      contained
      reset={refresh}
      onInitial={() => null}
      onSuccess={({ value, waiting }) => {
        const summary = summarizeEstimates(value.tickets, unit, phaseOf)
        return isEmptyEstimateSummary(summary) ? null : (
          <span className={cn(waiting && "animate-pulse")}>
            <SprintProgress sprint={sprint} summary={summary} />
          </span>
        )
      }}
    />
  )
}
