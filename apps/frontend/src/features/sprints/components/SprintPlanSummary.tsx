import type { Group, UserId } from "@pp/shared"

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@/components/ui/tooltip"
import { useProject } from "@/features/projects/hooks/useProject"
import {
  useSprintPlanning,
  useSprintTickets
} from "@/features/sprints/hooks/useSprintPlanning"
import {
  formatAmount,
  loadByAssignee,
  ownedBy,
  planMeasure,
  planTotals
} from "@/features/sprints/lib/sprintPlan"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { AssigneeLoadCard } from "./AssigneeLoadCard"

export function SprintPlanSummary({
  sprint,
  onFilterAssignee
}: Readonly<{
  sprint: Group
  onFilterAssignee: (assignee: UserId | "unassigned") => void
}>) {
  const { members } = useProject()
  const measure = planMeasure(useEstimationMode())
  const tickets = useSprintTickets(sprint.id)
  const planning = useSprintPlanning(measure)
  if (tickets === null) return null
  const { capacity, basis } = planning
  const { committed } = planTotals(tickets, measure)
  const over = capacity !== null && committed > capacity
  return (
    <span className="flex items-center gap-3.5 tabular-nums">
      {capacity !== null && (
        <Tooltip>
          <TooltipTrigger
            render={
              <span
                className={cn(
                  over ? "text-state-warning" : "text-muted-foreground"
                )}
              />
            }
          >
            {over
              ? m.sprints_capacity_over({
                  amount: formatAmount(measure, committed - capacity)
                })
              : m.sprints_capacity_left({
                  amount: formatAmount(measure, capacity - committed)
                })}
          </TooltipTrigger>
          <TooltipContent>
            {m.sprints_capacity_basis({
              count: basis,
              amount: formatAmount(measure, capacity)
            })}
          </TooltipContent>
        </Tooltip>
      )}
      <ul
        aria-label={m.sprints_load_label()}
        className="flex items-center gap-1.5"
      >
        {loadByAssignee(tickets, measure).map(({ assignee }) => {
          const member = members.find((each) => each.id === assignee)
          return (
            <li key={assignee ?? "unassigned"}>
              <AssigneeLoadCard
                sprint={sprint}
                assignee={assignee}
                member={member}
                tickets={ownedBy(tickets, assignee)}
                measure={measure}
                planning={planning}
                onFilter={
                  assignee === null
                    ? () => onFilterAssignee("unassigned")
                    : member
                      ? () => onFilterAssignee(member.id)
                      : null
                }
              />
            </li>
          )
        })}
      </ul>
    </span>
  )
}
