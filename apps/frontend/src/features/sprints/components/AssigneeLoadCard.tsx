import { useAtomValue } from "@effect/atom-react"
import {
  activeEstimate,
  type Group,
  type Member,
  type Ticket
} from "@pp/shared"
import { Button } from "@pp/ui/button"
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger
} from "@pp/ui/hover-card"
import { ArrowRight } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { MemberAvatar } from "@pp/ui/member-avatar"
import * as Result from "effect/reactivity/AsyncResult"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type { SprintPlanning } from "@/features/sprints/hooks/useSprintPlanning"
import {
  formatAmount,
  ownedBy,
  planTotals,
  usualDone,
  PlanMeasure
} from "@/features/sprints/lib/sprintPlan"
import { formatEstimateValue } from "@/features/tickets/lib/estimateMeta"
import { statusMetaFor } from "@/features/tickets/lib/ticketMeta"
import { m } from "@/paraglide/messages"

import { DONE_TONE, UNSTARTED_TONE } from "./SprintProgress"

const LISTED_TICKETS = 4
const HEADROOM = 1.15

export function AssigneeLoadCard({
  sprint,
  assignee,
  member,
  tickets,
  measure,
  planning,
  onFilter
}: Readonly<{
  sprint: Group
  assignee: string | null
  member: Member | undefined
  tickets: ReadonlyArray<Ticket>
  measure: PlanMeasure
  planning: SprintPlanning
  onFilter: (() => void) | null
}>) {
  const { committed, unestimated } = planTotals(tickets, measure)
  const amount = formatAmount(
    measure,
    PlanMeasure.$is("estimate")(measure) ? committed : tickets.length
  )
  const name = member?.name ?? m.sprints_load_unassigned()
  return (
    <HoverCard>
      <HoverCardTrigger
        render={
          <button
            type="button"
            aria-label={m.sprints_load_card_trigger({ name, amount })}
            onClick={(event) => {
              event.stopPropagation()
              onFilter?.()
            }}
            className="-mx-1 flex cursor-pointer items-center gap-1 rounded-full px-1 py-0.5 transition-colors outline-none hover:bg-hover hover:text-foreground focus-visible:ring-1 focus-visible:ring-ring"
          />
        }
      >
        <Avatar member={member} size={16} />
        <span className="tabular-nums">{amount}</span>
      </HoverCardTrigger>
      <HoverCardContent align="end" className="flex w-80 flex-col gap-3 p-3">
        <div className="flex items-center gap-2.5">
          <Avatar member={member} size={28} />
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-body font-semibold">{name}</span>
            <span className="text-caption text-muted-foreground tabular-nums">
              {PlanMeasure.$is("count")(measure)
                ? assignee === null
                  ? m.sprints_load_card_unowned_count({ amount })
                  : m.sprints_load_card_summary_count({
                      amount,
                      sprint: sprint.name
                    })
                : assignee === null
                  ? m.sprints_load_card_unowned({
                      amount,
                      count: tickets.length
                    })
                  : m.sprints_load_card_summary({
                      amount,
                      count: tickets.length,
                      sprint: sprint.name
                    })}
            </span>
          </div>
        </div>
        {assignee !== null && (
          <TrackRecord
            assignee={assignee}
            committed={committed}
            measure={measure}
            planning={planning}
          />
        )}
        <TicketPeek tickets={tickets} measure={measure} />
        {PlanMeasure.$is("estimate")(measure) && unestimated > 0 && (
          <span className="text-caption text-state-warning">
            {m.sprints_load_unestimated({ count: unestimated })}
          </span>
        )}
        {onFilter !== null && (
          <div className="-mx-3 -mb-3 border-t border-border/60 p-1.5">
            <Button
              variant="ghost"
              size="sm"
              trailingIcon={ArrowRight}
              onClick={(event) => {
                event.stopPropagation()
                onFilter()
              }}
              className="w-full justify-between px-1.5"
            >
              {assignee === null
                ? m.sprints_load_card_filter_unassigned()
                : m.sprints_load_card_filter()}
            </Button>
          </div>
        )}
      </HoverCardContent>
    </HoverCard>
  )
}

function Avatar({
  member,
  size
}: Readonly<{ member: Member | undefined; size: number }>) {
  return member ? (
    <MemberAvatar member={member} size={size} />
  ) : (
    <span
      className="shrink-0 rounded-full border border-dashed border-muted-foreground/50"
      style={{ width: size, height: size }}
    />
  )
}

function TrackRecord({
  assignee,
  committed,
  measure,
  planning
}: Readonly<{
  assignee: string
  committed: number
  measure: PlanMeasure
  planning: SprintPlanning
}>) {
  const { history, phaseOf, active } = planning
  if (phaseOf === null || PlanMeasure.$is("count")(measure)) return null
  const usual = usualDone(history, measure, phaseOf, assignee)
  const open = active
    ? planTotals(
        ownedBy(active.tickets, assignee).filter(
          (ticket) => phaseOf(ticket.status) !== "finished"
        ),
        measure
      ).committed
    : 0
  if (usual === null && open === 0) return null
  const over = usual !== null && committed > usual
  const scale = Math.max(usual ?? 0, committed) * HEADROOM || 1
  return (
    <div className="flex flex-col gap-1.5">
      {usual !== null && (
        <>
          <div
            aria-hidden
            className={cn("relative h-1.5 rounded-full", UNSTARTED_TONE)}
          >
            <span
              className={cn(
                "absolute inset-y-0 left-0 rounded-full",
                over ? "bg-state-warning" : DONE_TONE
              )}
              style={{ width: `${(committed / scale) * 100}%` }}
            />
            <span
              className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground"
              style={{ left: `${(usual / scale) * 100}%` }}
            />
          </div>
          <span
            className={cn(
              "text-caption tabular-nums",
              over ? "text-state-warning" : "text-muted-foreground"
            )}
          >
            {over
              ? m.sprints_load_card_over_usual({
                  amount: formatAmount(measure, committed - usual)
                })
              : m.sprints_load_card_usual({
                  amount: formatAmount(measure, usual)
                })}
          </span>
        </>
      )}
      {active && open > 0 && (
        <span className="text-caption text-muted-foreground tabular-nums">
          {m.sprints_load_card_open({
            amount: formatAmount(measure, open),
            sprint: active.sprint.name
          })}
        </span>
      )}
    </div>
  )
}

function TicketPeek({
  tickets,
  measure
}: Readonly<{ tickets: ReadonlyArray<Ticket>; measure: PlanMeasure }>) {
  const { orgSlug, slug } = useProjectRoute()
  const statuses = useAtomValue(statusesFor(statusesRequest(orgSlug, slug)))
  const projectStatuses = Result.isSuccess(statuses) ? statuses.value : []
  const listed = tickets.slice(0, LISTED_TICKETS)
  const rest = tickets.length - listed.length
  return (
    <div className="flex flex-col gap-1.5">
      <ul className="flex flex-col gap-1.5">
        {listed.map((ticket) => {
          const meta = statusMetaFor(ticket.status, projectStatuses)
          const Icon = meta.icon
          const estimate = PlanMeasure.$is("estimate")(measure)
            ? activeEstimate(ticket.estimate, measure.unit)
            : null
          return (
            <li
              key={ticket.id}
              className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-2 text-caption"
            >
              <Icon
                aria-label={meta.label}
                className={cn("size-3.5", meta.className)}
                style={meta.color ? { color: meta.color } : undefined}
                strokeWidth={1.75}
              />
              <span className="text-muted-foreground tabular-nums">
                {ticket.id}
              </span>
              <span className="truncate">{ticket.title}</span>
              <span className="text-muted-foreground tabular-nums">
                {estimate === null ? "" : formatEstimateValue(estimate)}
              </span>
            </li>
          )
        })}
      </ul>
      {rest > 0 && (
        <span className="text-caption text-muted-foreground">
          {m.sprints_load_card_more({ count: rest })}
        </span>
      )}
    </div>
  )
}
