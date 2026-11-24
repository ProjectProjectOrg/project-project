import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { type Group, type GroupId, type TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Chip } from "@pp/ui/chip"
import { CircleDashed, Plus, Zap } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import {
  PickerField,
  PickerFieldOpen,
  PickerFieldValue
} from "@pp/ui/picker-field"
import { TextSwap } from "@pp/ui/text-swap"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  addTicketsToSprint,
  bulkAssignTicketSprint,
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
          if (s === null) {
            if (!selection.patchBulk({ sprint: null }) && membership) {
              void removeTickets({ groupId: membership.id })
            }
            return
          }
          if (selection.count === 1) {
            addTickets({ groupId: s.id })
            return
          }
          void fireMutation(registry, bulkAssignTicketSprint(req), {
            patch: { sprint: s.id },
            tickets: selection.selectedIds()
          })
        }}
        onRequestNewSprint={onRequestNewSprint}
        trigger={
          <Chip
            interaction="press"
            onClick={(e) => e.stopPropagation()}
            aria-label={
              failed
                ? m.tickets_sprint_assign_error_fallback()
                : membership
                  ? m.tickets_sprint_chip_aria({ name: membership.name })
                  : placeholder
            }
            tone={failed ? "error" : undefined}
            className="max-w-[14ch]"
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
          </Chip>
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
  const label = current?.name ?? m.tickets_sprint_none()

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
      onSelect={(sprint) => onChange(sprint?.id ?? null)}
      trigger={
        <Button
          type="button"
          variant="ghost"
          tone={current ? "strong" : "muted"}
          aria-label={m.tickets_sprint_chip_aria({ name: label })}
        >
          <TextSwap
            className="gap-1.5"
            icon={
              current ? (
                <SprintStateIcon sprint={current} size="sm" />
              ) : (
                <CircleDashed className="size-3.5" strokeWidth={1.75} />
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
    : (current?.name ?? m.tickets_sprint_none())

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
    <PickerField>
      <fieldset disabled={current !== null && !canMove} className="contents">
        <SprintAssignMenu
          open={open}
          onOpenChange={setOpen}
          sprints={sprints}
          selectedId={current?.id ?? null}
          tooltip={label}
          onSelect={(s) => {
            if (s !== null) addTickets({ groupId: s.id })
            else if (current) void removeTickets({ groupId: current.id })
          }}
          trigger={
            <PickerFieldValue
              empty={current === null}
              tone={failed ? "error" : undefined}
              onClick={(e) => e.stopPropagation()}
              aria-label={
                failed ? label : m.tickets_sprint_chip_aria({ name: label })
              }
              className={className}
            >
              {current ? (
                <SprintStateIcon sprint={current} size="sm" />
              ) : (
                <CircleDashed className="size-3.5" strokeWidth={1.75} />
              )}
              <span className="max-w-[24ch] truncate">{label}</span>
            </PickerFieldValue>
          }
        />
      </fieldset>
      {current !== null && (
        <PickerFieldOpen
          label={m.tickets_sprint_open_action()}
          render={
            <Link
              to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
              params={{ orgSlug, slug, groupId: current.id }}
              preload="intent"
            />
          }
        />
      )}
    </PickerField>
  )
}
