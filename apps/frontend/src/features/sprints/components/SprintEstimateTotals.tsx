import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  estimationUnit,
  summarizeEstimates,
  type EstimateUnit,
  type GroupId
} from "@pp/shared"

import { AsyncView } from "@/components/shell/AsyncView"
import { boardRequest, sprintBoard } from "@/features/sprints/atoms/sprintBoard"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { formatEstimateSummary } from "@/features/tickets/lib/estimateMeta"
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
  const req = boardRequest(orgSlug, slug, groupId)
  const board = useAtomValue(sprintBoard(req))
  const refresh = useAtomRefresh(sprintBoard(req))
  return (
    <AsyncView
      result={board}
      contained
      reset={refresh}
      onInitial={() => null}
      onSuccess={({ value, waiting }) => {
        const text = formatEstimateSummary(
          summarizeEstimates(value.tickets, unit)
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
