import { useAtomValue } from "@effect/atom-react"
import {
  estimationUnit,
  summarizeEstimates,
  type EstimateUnit,
  type GroupId
} from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"

import { boardRequest, sprintBoard } from "@/features/sprints/atoms/sprintBoard"
import { useEstimationMode } from "@/hooks/useEstimationMode"
import { formatEstimateSummary } from "@/lib/estimate-meta"
import { cn } from "@/lib/utils"

type SprintEstimateTotalsProps = Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId
}>

export function SprintEstimateTotals(props: SprintEstimateTotalsProps) {
  const unit = estimationUnit(useEstimationMode())
  return unit === null ? null : <SprintEstimateSummary {...props} unit={unit} />
}

function SprintEstimateSummary({
  orgSlug,
  slug,
  groupId,
  unit
}: SprintEstimateTotalsProps & Readonly<{ unit: EstimateUnit }>) {
  const board = useAtomValue(sprintBoard(boardRequest(orgSlug, slug, groupId)))
  return Result.matchWithError(board, {
    onInitial: () => null,
    onError: () => null,
    onDefect: () => null,
    onSuccess: ({ value, waiting }) => {
      const text = formatEstimateSummary(
        summarizeEstimates(value.tickets, unit)
      )
      return text === null ? null : (
        <span className={cn("tabular-nums", waiting && "animate-pulse")}>
          {text}
        </span>
      )
    }
  })
}
