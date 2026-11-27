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
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useState, type ComponentProps } from "react"

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
  disabled,
  placeholder
}: {
  ticketId: TicketId
  membership: Group | null
  variant?: "default" | "responsive"
  disabled: boolean
  // Not in a sprint: an empty chip that adds it to one ("Sprint"), for a
  // selected row, which shows every field.
  placeholder?: string
}) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const addState = useAtomValue(addTicketsToSprint({ req, ticketId }))
  const removeState = useAtomValue(removeTicketsFromSprint({ req, ticketId }))
  const canMove = GroupPolicy.can(useProjectActor(), "sprint", "remove_ticket")
  if (!membership && placeholder === undefined) return null
  const failed = Result.isFailure(addState) || Result.isFailure(removeState)
  return (
    <Chip
      interaction="press"
      disabled={disabled || !canMove}
      aria-haspopup="menu"
      data-row-field="sprint"
      data-row-menu="sprint"
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
  )
}

export function SprintFieldMenu({
  ticketId,
  open,
  onOpenChange,
  anchor,
  finalFocus
}: Readonly<{ ticketId: TicketId }> &
  Pick<
    ComponentProps<typeof SprintAssignMenu>,
    "open" | "onOpenChange" | "anchor" | "finalFocus"
  >) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const membershipResult = useAtomValue(sprintMembership(req))
  const addTickets = useAtomSet(addTicketsToSprint({ req, ticketId }))
  const removeTickets = useAtomSet(removeTicketsFromSprint({ req, ticketId }), {
    mode: "promiseExit"
  })
  const registry = use(RegistryContext)
  const selection = useSelectionActions(selectionKey(slug, ticketId))
  const membership = Result.isSuccess(membershipResult)
    ? (membershipResult.value.get(ticketId) ?? null)
    : null
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
  return (
    <SprintAssignMenu
      open={open}
      onOpenChange={onOpenChange}
      anchor={anchor}
      finalFocus={finalFocus}
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
    />
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
        <PickerFieldValue
          empty={current === null}
          label={label}
          icon={
            current ? (
              <SprintStateIcon sprint={current} size="sm" />
            ) : (
              <CircleDashed className="size-3.5" strokeWidth={1.75} />
            )
          }
          aria-label={m.tickets_sprint_chip_aria({ name: label })}
        />
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
  const [open, setOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const {
    orgSlug,
    slug,
    sprints,
    current,
    failed,
    canMove,
    canPlan,
    hasAnyEligible,
    label,
    loaded,
    addTickets,
    removeTickets
  } = useSprintAssignment(ticketId)
  if (creating || (!hasAnyEligible && loaded && canPlan)) {
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
              truncate
              label={label}
              icon={
                current ? (
                  <SprintStateIcon sprint={current} size="sm" />
                ) : (
                  <CircleDashed className="size-3.5" strokeWidth={1.75} />
                )
              }
              tone={failed ? "error" : undefined}
              onClick={(e) => e.stopPropagation()}
              aria-label={
                failed ? label : m.tickets_sprint_chip_aria({ name: label })
              }
              className={className}
            />
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

function useSprintAssignment(ticketId: TicketId) {
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

  return {
    orgSlug,
    slug,
    sprints,
    current,
    failed,
    canMove,
    canPlan,
    hasAnyEligible,
    label,
    loaded: Result.isSuccess(list),
    addTickets,
    removeTickets
  }
}
