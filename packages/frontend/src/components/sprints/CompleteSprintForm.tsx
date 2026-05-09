import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { Exit } from "effect"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  completeSprintAtom,
  projectKey,
  type CompleteSprintDestination
} from "@/atoms/sprints"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import {
  pickEarliestPlannedSprint,
  type Group,
  type TicketId
} from "@projectproject/shared"

export function CompleteSprintForm({
  orgSlug,
  slug,
  sprint,
  sprints,
  onDone
}: {
  orgSlug: string
  slug: string
  sprint: Group
  sprints: ReadonlyArray<Group>
  onDone?: () => void
}) {
  const key = projectKey(orgSlug, slug)
  const complete = useAtomSet(completeSprintAtom(key), {
    mode: "promiseExit"
  })
  const completeState = useAtomValue(completeSprintAtom(key))
  const submitting = completeState.waiting

  const planned = pickEarliestPlannedSprint(sprints)
  const tickets = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
  const statuses = new Map<TicketId, string>()
  if (Result.isSuccess(tickets)) {
    for (const t of tickets.value) statuses.set(t.id, t.status)
  }

  const [destination, setDestination] = useState<"planned" | "backlog">(
    planned ? "planned" : "backlog"
  )

  async function onSubmit() {
    const dest: CompleteSprintDestination =
      destination === "planned" && planned
        ? { kind: "sprint", groupId: planned.id }
        : { kind: "backlog" }
    const exit = await complete({
      groupId: sprint.id,
      destination: dest,
      ticketStatuses: statuses
    })
    if (Exit.isSuccess(exit)) {
      onDone?.()
    }
  }

  const carryCount = sprint.tickets.filter((tid) => {
    const s = statuses.get(tid)
    return s !== "done"
  }).length

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">
        {carryCount === 0
          ? m.sprints_complete_no_carryover()
          : m.sprints_complete_carry_count({ count: carryCount })}
      </div>
      {planned ? (
        <div className="flex items-center gap-1 self-start rounded-md bg-muted p-0.5 text-xs">
          <PillButton
            active={destination === "planned"}
            onClick={() => setDestination("planned")}
          >
            {m.sprints_complete_carry_to_planned({ name: planned.name })}
          </PillButton>
          <PillButton
            active={destination === "backlog"}
            onClick={() => setDestination("backlog")}
          >
            {m.sprints_complete_carry_to_backlog()}
          </PillButton>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          {m.sprints_complete_carry_to_backlog_static()}
        </p>
      )}
      <div className="flex justify-end gap-1">
        {onDone && (
          <Button
            type="button"
            size="xs"
            variant="tertiary"
            onClick={onDone}
            disabled={submitting}
          >
            {m.common_cancel_button()}
          </Button>
        )}
        <Button
          type="button"
          size="xs"
          variant="primary"
          onClick={onSubmit}
          disabled={submitting}
        >
          {submitting
            ? m.sprints_complete_in_progress()
            : m.sprints_complete_button()}
        </Button>
      </div>
    </div>
  )
}

function PillButton({
  active,
  onClick,
  children
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-sm px-2 py-1 text-xs transition-colors",
        active
          ? "bg-background text-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  )
}
