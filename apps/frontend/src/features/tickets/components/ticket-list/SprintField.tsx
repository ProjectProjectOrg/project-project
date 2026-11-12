import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { type Group, type GroupId, type TicketId } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { Plus } from "lucide-react"
import { use, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { Button } from "@/components/ui/button"
import { Hitbox } from "@/components/ui/hitbox"
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
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useSelectionActions } from "./TicketSelection"

export function SprintField({
  ticketId,
  membership,
  variant = "default",
  onRequestNewSprint
}: {
  ticketId: TicketId
  membership: Group | null
  variant?: "default" | "responsive"
  onRequestNewSprint?: () => void
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

  if (!membership) return null

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
      ? membership.id
      : selectedSprints.size === 1
        ? sharedSprint
        : null
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
        onClear={() => {
          if (!selection.patchBulk({ sprint: null })) {
            void removeTickets({ groupId: membership.id })
          }
        }}
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
                "inline-flex max-w-[14ch] items-center gap-1 rounded-md px-1.5 py-0.5 text-caption transition-colors hitbox-hover:bg-foreground/5",
                failed
                  ? "text-destructive"
                  : "text-muted-foreground hitbox-hover:text-foreground"
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
          variant="chip"
          aria-label={
            current
              ? m.tickets_sprint_chip_aria({ name: current.name })
              : m.tickets_assign_sprint_chip()
          }
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
          <Button type="button" variant="chip" className={className}>
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
