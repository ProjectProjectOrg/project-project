import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import { SprintAssignMenu } from "@/components/sprints/SprintAssignMenu"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"
import {
  addTicketsToSprint,
  removeTicketsFromSprint,
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/atoms/sprintList"
import { type Group, type TicketId } from "@projectproject/shared"

export function SprintField({
  orgSlug,
  slug,
  ticketId,
  membership,
  onRequestNewSprint
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  membership: Group | null
  onRequestNewSprint?: () => void
}) {
  const req = useMemo(() => sprintListRequest(orgSlug, slug), [orgSlug, slug])
  const list = useAtomValue(sprintList(req))
  const addTickets = useAtomSet(addTicketsToSprint(req))
  const addState = useAtomValue(addTicketsToSprint(req))
  const removeTickets = useAtomSet(removeTicketsFromSprint(req))
  const removeState = useAtomValue(removeTicketsFromSprint(req))
  const [open, setOpen] = useState(false)

  if (!membership) return null

  const sprints = Result.isSuccess(list) ? list.value : []
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={membership.id}
      onSelect={(s) => addTickets({ groupId: s.id, ticketIds: [ticketId] })}
      onClear={() =>
        removeTickets({ groupId: membership.id, ticketIds: [ticketId] })
      }
      onRequestNewSprint={onRequestNewSprint}
      trigger={
        <Hitbox
          mode="inline"
          margin="2"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            failed
              ? m.tickets_sprint_assign_error_fallback()
              : m.tickets_sprint_chip_aria({ name: membership.name })
          }
          className="min-w-0"
        >
          <span
            className={cn(
              "inline-flex max-w-[14ch] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs transition-colors group-hover/hitbox:bg-foreground/5",
              failed
                ? "text-destructive"
                : "text-muted-foreground group-hover/hitbox:text-foreground"
            )}
          >
            <SprintStateIcon sprint={membership} size="xs" />
            <span className="truncate">{membership.name}</span>
          </span>
        </Hitbox>
      }
    />
  )
}

export function SprintBadgeTrigger({
  orgSlug,
  slug,
  ticketId,
  className
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  className?: string
}) {
  const req = useMemo(() => sprintListRequest(orgSlug, slug), [orgSlug, slug])
  const list = useAtomValue(sprintList(req))
  const membership = useAtomValue(sprintMembership(req))
  const addTickets = useAtomSet(addTicketsToSprint(req))
  const addState = useAtomValue(addTicketsToSprint(req))
  const removeTickets = useAtomSet(removeTicketsFromSprint(req))
  const removeState = useAtomValue(removeTicketsFromSprint(req))
  const [open, setOpen] = useState(false)
  const sprints = Result.isSuccess(list) ? list.value : []
  const hasAnyEligible = sprints.some((s) => s.completedAt === null)
  const current = Result.isSuccess(membership)
    ? (membership.value.get(ticketId) ?? null)
    : null
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)
  const label = failed
    ? m.tickets_sprint_assign_error_fallback()
    : (current?.name ?? m.tickets_assign_sprint_chip())

  if (!hasAnyEligible) return null

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={current?.id ?? null}
      onSelect={(s) => addTickets({ groupId: s.id, ticketIds: [ticketId] })}
      onClear={
        current
          ? () => removeTickets({ groupId: current.id, ticketIds: [ticketId] })
          : undefined
      }
      trigger={
        <Button
          type="button"
          variant="chip"
          onClick={(e) => e.stopPropagation()}
          aria-label={
            failed
              ? m.tickets_sprint_assign_error_fallback()
              : current
                ? m.tickets_sprint_chip_aria({ name: current.name })
                : m.tickets_assign_sprint_chip()
          }
          className={cn(failed && "text-destructive", className)}
        >
          {current ? (
            <SprintStateIcon sprint={current} size="xs" />
          ) : (
            <Plus className="size-3.5" strokeWidth={1.75} />
          )}
          <span className="max-w-[14ch] truncate">{label}</span>
        </Button>
      }
    />
  )
}
