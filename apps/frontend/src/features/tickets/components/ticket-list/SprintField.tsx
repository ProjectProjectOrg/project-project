import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { type Group, type GroupId, type TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { chipClassName } from "@pp/ui/chip"
import { Plus, Zap } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { TextSwap } from "@pp/ui/text-swap"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  addTicketsToSprint,
  bulkAddTicketsToSprint,
  removeTicketsFromSprint,
  sprintList,
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { NewSprintPopover } from "@/features/sprints/components/NewSprintPopover"
import { SprintAssignMenu } from "@/features/sprints/components/SprintAssignMenu"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { useSelectionActions } from "./TicketSelection"

export function SprintField({
  ticketId,
  membership,
  variant = "default",
  onRequestNewSprint,
  placeholder
}: {
  ticketId: TicketId
  membership: Group | null
  variant?: "default" | "responsive"
  onRequestNewSprint?: () => void
  // Not in a sprint: an empty chip that adds it to one ("Sprint"), for a
  // selected row, which shows every field.
  placeholder?: string
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const addTickets = useAtomSet(addTicketsToSprint({ req, ticketId }))
  const addState = useAtomValue(addTicketsToSprint({ req, ticketId }))
  const removeTickets = useAtomSet(removeTicketsFromSprint({ req, ticketId }), {
    mode: "promiseExit"
  })
  const removeState = useAtomValue(removeTicketsFromSprint({ req, ticketId }))
  const [open, setOpen] = useState(false)
  const canMove = GroupPolicy.can(useProjectActor(), "sprint", "remove_ticket")
  const registry = use(RegistryContext)
  const selection = useSelectionActions(selectionKey(slug, ticketId))

  if (!membership && placeholder === undefined) return null

  const sprints = Result.isSuccess(list) ? list.value : []
  const sprintOf = (id: TicketId) =>
    sprints.find(
      (sprint) => sprint.completedAt === null && sprint.tickets.includes(id)
    )?.id ?? null
  const selectedSprints = new Set(
    selection.selectedTickets.map((each) => sprintOf(each.id))
  )
  const [sharedSprint = null] = selectedSprints
  const selectedId =
    selection.count === 1
      ? (membership?.id ?? null)
      : selectedSprints.size === 1
        ? sharedSprint
        : undefined
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)

  return (
    <fieldset disabled={!canMove} className="contents">
      <SprintAssignMenu
        open={open}
        onOpenChange={setOpen}
        sprints={sprints}
        selectedId={selectedId}
        onSelect={(s) => {
          if (selection.count === 1) {
            addTickets({ groupId: s.id })
            return
          }
          void fireMutation(registry, bulkAddTicketsToSprint(req), {
            groupId: s.id,
            tickets: selection.selectedIds()
          })
        }}
        // Removing is offered only when one of them is in a sprint.
        onClear={
          membership || [...selectedSprints].some((id) => id !== null)
            ? () => {
                if (!selection.patchBulk({ sprint: null }) && membership) {
                  void removeTickets({ groupId: membership.id })
                }
              }
            : undefined
        }
        onRequestNewSprint={onRequestNewSprint}
        trigger={
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            aria-label={
              failed
                ? m.tickets_sprint_assign_error_fallback()
                : membership
                  ? m.tickets_sprint_chip_aria({ name: membership.name })
                  : placeholder
            }
            className={chipClassName({
              interaction: "press",
              className: cn(
                "max-w-[14ch] gap-1",
                failed && "text-destructive hover:text-destructive",
                !membership && "text-muted-foreground"
              )
            })}
          >
            {membership ? (
              <SprintStateIcon sprint={membership} size="xs" />
            ) : (
              <Zap className="size-3 shrink-0" strokeWidth={1.75} />
            )}
            <span
              className={cn(
                "truncate",
                variant === "responsive" && "hidden sm:inline"
              )}
            >
              {membership?.name ?? placeholder}
            </span>
          </button>
        }
      />
    </fieldset>
  )
}

export function SprintSelect({
  value,
  onChange
}: {
  value: GroupId | null
  onChange: (groupId: GroupId | null) => void
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
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
        <Button
          type="button"
          variant="ghost"
          tone={current ? "strong" : "muted"}
          aria-label={
            current
              ? m.tickets_sprint_chip_aria({ name: current.name })
              : m.tickets_assign_sprint_chip()
          }
        >
          <TextSwap
            className="max-w-[14ch] gap-1.5"
            icon={
              current ? (
                <SprintStateIcon sprint={current} size="xs" />
              ) : (
                <Plus className="size-3.5" strokeWidth={1.75} />
              )
            }
          >
            {label}
          </TextSwap>
        </Button>
      }
    />
  )
}

export function SprintBadgeTrigger({
  ticketId,
  className
}: {
  ticketId: TicketId
  className?: string
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const membership = useAtomValue(sprintMembership(req))
  const addTickets = useAtomSet(addTicketsToSprint({ req, ticketId }))
  const addState = useAtomValue(addTicketsToSprint({ req, ticketId }))
  const removeTickets = useAtomSet(removeTicketsFromSprint({ req, ticketId }), {
    mode: "promiseExit"
  })
  const removeState = useAtomValue(removeTicketsFromSprint({ req, ticketId }))
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const sprints = Result.isSuccess(list) ? list.value : []
  const hasAnyEligible = sprints.some((s) => s.completedAt === null)
  const current = Result.isSuccess(membership)
    ? (membership.value.get(ticketId) ?? null)
    : null
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)
  const actor = useProjectActor()
  const canMove = GroupPolicy.can(actor, "sprint", "remove_ticket")
  const canPlan = GroupPolicy.can(actor, "sprint", "manage")
  const label = failed
    ? m.tickets_sprint_assign_error_fallback()
    : (current?.name ?? m.tickets_assign_sprint_chip())

  if (creating || (!hasAnyEligible && Result.isSuccess(list) && canPlan)) {
    return (
      <NewSprintPopover
        open={creating}
        onOpenChange={setCreating}
        tickets={[ticketId]}
        trigger={
          <Button type="button" variant="ghost" className={className}>
            <Plus className="size-3.5" strokeWidth={1.75} />
            <span>{m.sprints_new_button()}</span>
          </Button>
        }
      />
    )
  }
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
            variant="ghost"
            tone={current ? "strong" : "muted"}
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
            <TextSwap
              className="max-w-[14ch] gap-1.5"
              icon={
                current ? (
                  <SprintStateIcon sprint={current} size="xs" />
                ) : (
                  <Plus className="size-3.5" strokeWidth={1.75} />
                )
              }
            >
              {label}
            </TextSwap>
          </Button>
        }
      />
    </fieldset>
  )
}
