import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import { CommandMenuCheck, CommandMenuItem } from "@pp/ui/command-menu"
import { CircleDashed, CircleSlash, Plus, Timer } from "@pp/ui/icons"
import * as Result from "effect/reactivity/AsyncResult"
import { useContext, useState, type ReactNode } from "react"

import { fireMutation } from "@/api/viewMutation"
import { commandScopes } from "@/features/command-menu/atoms/commandMenu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type {
  SelectedTicket,
  TicketContext
} from "@/features/command-menu/lib/commandMenu"
import { scopeSelectionUpdate } from "@/features/command-menu/lib/commandScopes"
import { newSprintRequest } from "@/features/sprints/atoms/createSprint"
import {
  assignTicketToSprint,
  bulkAddTicketsToSprint,
  removeTicketFromSprint,
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { bulkUpdateTickets } from "@/features/tickets/atoms/bulkTickets"
import { m } from "@/paraglide/messages"

import { groupBy } from "../ticket-list/selectionUndo"
import {
  StagedChanges,
  stagedCount,
  StagedMove,
  StagedRowCount,
  StagedValue
} from "./StagedChanges"

const REMOVE = "remove"
const NEW = "new"

const rank = (sprint: Group) => (sprintState(sprint) === "active" ? 0 : 1)

const byStateThenStart = (a: Group, b: Group) => {
  return (
    rank(a) - rank(b) ||
    (a.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER) -
      (b.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER)
  )
}

export function TicketSprintCommands({
  ticket: { orgSlug, slug, ticketId },
  selection,
  chip,
  onBack,
  onClose,
  onNewSprint
}: Readonly<{
  ticket: TicketContext
  selection: ReadonlyArray<SelectedTicket>
  chip: ReactNode
  onBack: () => void
  onClose: () => void
  // Opens cmd+k's New sprint page; the tickets ride along in newSprintRequest.
  onNewSprint: () => void
}>) {
  const registry = useContext(RegistryContext)
  const updateSelection = scopeSelectionUpdate(useAtomValue(commandScopes))
  const req = sprintListRequest(orgSlug, slug)
  const result = useAtomValue(sprintList(req))
  const open = Result.isSuccess(result)
    ? result.value
        .filter((sprint) => sprint.completedAt === null)
        .toSorted(byStateThenStart)
    : []
  const ids =
    selection.length > 1 ? selection.map((each) => each.id) : [ticketId]
  const many = ids.length > 1
  const current = open.find((sprint) =>
    ids.every((id) => sprint.tickets.includes(id))
  )
  const inAnySprint = open.some((sprint) =>
    ids.some((id) => sprint.tickets.includes(id))
  )
  const byId = new Map<string, Group>(open.map((sprint) => [sprint.id, sprint]))
  // Several tickets: a pick is staged, and Apply (or picking it again)
  // sends it.
  const [staged, setStaged] = useState<string | null>(null)
  const groups = groupBy(
    selection,
    (each) =>
      open.find((sprint) => sprint.tickets.includes(each.id))?.id ?? null
  )
  const counts = new Map<string | null, number>(
    groups.map(([id, group]) => [id, group.length])
  )
  const value = (id: string | null) => {
    const sprint = id === null ? undefined : byId.get(id)
    return sprint === undefined ? (
      <StagedValue
        label={m.tickets_sprint_none()}
        icon={<CircleDashed strokeWidth={1.75} />}
      />
    ) : (
      <StagedValue
        label={sprint.name}
        icon={<SprintStateIcon sprint={sprint} size="xs" />}
      />
    )
  }
  const target = staged === REMOVE ? null : staged
  const lines =
    staged === null
      ? []
      : groups
          .filter(([id]) => id !== target)
          .map(([id, group]) => ({
            key: id ?? REMOVE,
            count: group.length,
            change: <StagedMove from={value(id)} to={value(target)} />
          }))
  const apply = (value: string) => {
    const sprint = byId.get(value)
    if (
      many &&
      updateSelection !== null &&
      (sprint !== undefined || value === REMOVE)
    ) {
      // Through the selection, so the bar offers Undo: each ticket back to
      // the sprint it was in.
      void updateSelection(
        slug,
        ids,
        { sprint: sprint?.id ?? null },
        groups.map(([id, group]) => ({ ids: group, patch: { sprint: id } }))
      )
    } else if (many && value === REMOVE) {
      void fireMutation(registry, bulkUpdateTickets({ orgSlug, slug }), {
        tickets: ids,
        patch: { sprint: null }
      })
    } else if (many && sprint !== undefined && sprint !== current) {
      void fireMutation(registry, bulkAddTicketsToSprint(req), {
        groupId: sprint.id,
        tickets: ids
      })
    } else if (value === REMOVE && current !== undefined) {
      removeTicketFromSprint(registry, req, ticketId, current.id)
    } else if (sprint !== undefined && sprint !== current) {
      assignTicketToSprint(registry, req, ticketId, sprint.id)
    }
    onClose()
  }
  const newSprint = () => {
    registry.set(newSprintRequest, {
      orgSlug,
      projectSlug: slug,
      tickets: ids
    })
    onNewSprint()
  }
  return (
    <CommandFrame
      chip={chip}
      placeholder={m.tickets_command_sprint_placeholder()}
      onBack={onBack}
      empty={
        Result.isSuccess(result)
          ? {
              icon: Timer,
              title: m.tickets_command_no_sprints_title(),
              description: m.tickets_command_no_sprints_body(),
              action: {
                label: m.tickets_command_no_sprints_action(),
                icon: Plus,
                run: newSprint
              }
            }
          : undefined
      }
      items={[
        ...open.map((sprint) => ({ value: sprint.id, label: sprint.name })),
        ...(open.length === 0
          ? []
          : [
              { value: NEW, label: m.tickets_command_new_sprint(), icon: Plus }
            ]),
        ...(!inAnySprint
          ? []
          : [
              {
                value: REMOVE,
                label: m.tickets_command_remove_from_sprint(),
                icon: CircleSlash
              }
            ])
      ]}
      onSelect={(item) => {
        if (item.value === NEW) {
          newSprint()
          return
        }
        if (many && staged !== item.value) {
          setStaged(item.value)
          return
        }
        apply(item.value)
      }}
      onSubmit={
        many && staged !== null && lines.length > 0
          ? () => apply(staged)
          : undefined
      }
      footer={
        many ? (
          <StagedChanges
            hint={m.tickets_selection_choose()}
            applyLabel={m.tickets_selection_apply({
              count: stagedCount(lines, ids.length)
            })}
            onApply={() => {
              if (staged !== null) apply(staged)
            }}
            lines={lines}
          />
        ) : undefined
      }
      renderItem={(item) => {
        const sprint = byId.get(item.value)
        return (
          <CommandMenuItem value={item.value}>
            {sprint !== undefined && (
              <SprintStateIcon sprint={sprint} size="md" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {many && <StagedRowCount count={counts.get(item.value)} />}
            <CommandMenuCheck
              checked={
                sprint !== undefined &&
                (many
                  ? (staged ?? current?.id) === sprint.id
                  : sprint === current)
              }
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}
