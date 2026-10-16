import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { type Group, type GroupId, type TicketId } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import { useMemo, useState } from "react"

import { SprintAssignMenu } from "@/components/sprints/SprintAssignMenu"
import { SprintStateIcon } from "@/components/sprints/SprintChip"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
import {
  addTicketsToSprint,
  removeTicketsFromSprint,
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { useProjectActor } from "@/lib/access"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

export function SprintField({
  orgSlug,
  slug,
  ticketId,
  membership,
  variant = "default",
  onRequestNewSprint
}: {
  orgSlug: string
  slug: string
  ticketId: TicketId
  membership: Group | null
  variant?: "default" | "responsive"
  onRequestNewSprint?: () => void
}) {
  const req = useMemo(() => sprintListRequest(orgSlug, slug), [orgSlug, slug])
  const list = useAtomValue(sprintList(req))
  const addTickets = useAtomSet(addTicketsToSprint({ req, ticketId }))
  const addState = useAtomValue(addTicketsToSprint({ req, ticketId }))
  const removeTickets = useAtomSet(removeTicketsFromSprint({ req, ticketId }))
  const removeState = useAtomValue(removeTicketsFromSprint({ req, ticketId }))
  const [open, setOpen] = useState(false)
  const canMove = GroupPolicy.can(useProjectActor(), "sprint", "remove_ticket")

  if (!membership) return null

  const sprints = Result.isSuccess(list) ? list.value : []
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)

  return (
    <fieldset disabled={!canMove} className="contents">
      <SprintAssignMenu
        open={open}
        onOpenChange={setOpen}
        sprints={sprints}
        selectedId={membership.id}
        onSelect={(s) => addTickets({ groupId: s.id })}
        onClear={() => removeTickets({ groupId: membership.id })}
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
              <span
                className={cn(
                  "truncate",
                  variant === "responsive" && "hidden sm:inline"
                )}
              >
                {membership.name}
              </span>
            </span>
          </Hitbox>
        }
      />
    </fieldset>
  )
}

export function SprintSelect({
  orgSlug,
  slug,
  value,
  onChange
}: {
  orgSlug: string
  slug: string
  value: GroupId | null
  onChange: (groupId: GroupId | null) => void
}) {
  const req = useMemo(() => sprintListRequest(orgSlug, slug), [orgSlug, slug])
  const list = useAtomValue(sprintList(req))
  const [open, setOpen] = useState(false)
  const sprints = Result.isSuccess(list) ? list.value : []
  const current = sprints.find((sprint) => sprint.id === value) ?? null
  const label = current?.name ?? m.tickets_assign_sprint_chip()

  if (
    !sprints.some((sprint) => sprint.completedAt === null) &&
    value === null
  ) {
    return null
  }

  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={setOpen}
      sprints={sprints}
      selectedId={current?.id ?? null}
      onSelect={(sprint) => onChange(sprint.id)}
      onClear={value !== null ? () => onChange(null) : undefined}
      trigger={
        <Hitbox
          mode="inline"
          margin="2"
          aria-label={
            current
              ? m.tickets_sprint_chip_aria({ name: current.name })
              : m.tickets_assign_sprint_chip()
          }
          className="min-w-0"
        >
          <span className="inline-flex max-w-[14ch] items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted-foreground transition-colors group-hover/hitbox:bg-foreground/5 group-hover/hitbox:text-foreground">
            {current ? (
              <SprintStateIcon sprint={current} size="xs" />
            ) : (
              <Plus className="size-3.5" strokeWidth={1.75} />
            )}
            <span className="truncate">{label}</span>
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
  const addTickets = useAtomSet(addTicketsToSprint({ req, ticketId }))
  const addState = useAtomValue(addTicketsToSprint({ req, ticketId }))
  const removeTickets = useAtomSet(removeTicketsFromSprint({ req, ticketId }))
  const removeState = useAtomValue(removeTicketsFromSprint({ req, ticketId }))
  const [open, setOpen] = useState(false)
  const sprints = Result.isSuccess(list) ? list.value : []
  const hasAnyEligible = sprints.some((s) => s.completedAt === null)
  const current = Result.isSuccess(membership)
    ? (membership.value.get(ticketId) ?? null)
    : null
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)
  const canMove = GroupPolicy.can(useProjectActor(), "sprint", "remove_ticket")
  const label = failed
    ? m.tickets_sprint_assign_error_fallback()
    : (current?.name ?? m.tickets_assign_sprint_chip())

  if (!hasAnyEligible) return null

  return (
    <fieldset disabled={current !== null && !canMove} className="contents">
      <SprintAssignMenu
        open={open}
        onOpenChange={setOpen}
        sprints={sprints}
        selectedId={current?.id ?? null}
        onSelect={(s) => addTickets({ groupId: s.id })}
        onClear={
          current ? () => removeTickets({ groupId: current.id }) : undefined
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
    </fieldset>
  )
}
