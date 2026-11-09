import { RegistryContext, useAtomValue } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { CircleSlash, Plus, Timer } from "lucide-react"
import { useContext, type ReactNode } from "react"

import { CommandMenuCheck, CommandMenuItem } from "@/components/ui/command-menu"
import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { TicketContext } from "@/features/command-menu/lib/commandMenu"
import { createSprintDialog } from "@/features/sprints/atoms/createSprintDialog"
import {
  assignTicketToSprint,
  removeTicketFromSprint,
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintStateIcon } from "@/features/sprints/components/SprintChip"
import { m } from "@/paraglide/messages"

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
  chip,
  onBack,
  onClose
}: Readonly<{
  ticket: TicketContext
  chip: ReactNode
  onBack: () => void
  onClose: () => void
}>) {
  const registry = useContext(RegistryContext)
  const req = sprintListRequest(orgSlug, slug)
  const result = useAtomValue(sprintList(req))
  const open = Result.isSuccess(result)
    ? result.value
        .filter((sprint) => sprint.completedAt === null)
        .toSorted(byStateThenStart)
    : []
  const current = open.find((sprint) => sprint.tickets.includes(ticketId))
  const byId = new Map<string, Group>(open.map((sprint) => [sprint.id, sprint]))
  const newSprint = () => {
    registry.set(createSprintDialog, {
      orgSlug,
      projectSlug: slug,
      tickets: [ticketId]
    })
    onClose()
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
        ...(current === undefined
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
        if (item.value === REMOVE && current !== undefined) {
          removeTicketFromSprint(registry, req, ticketId, current.id)
        } else {
          const sprint = byId.get(item.value)
          if (sprint !== undefined && sprint !== current) {
            assignTicketToSprint(registry, req, ticketId, sprint.id)
          }
        }
        onClose()
      }}
      renderItem={(item) => {
        const sprint = byId.get(item.value)
        return (
          <CommandMenuItem value={item.value}>
            {sprint !== undefined && (
              <SprintStateIcon sprint={sprint} size="md" />
            )}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {sprint !== undefined && sprint === current && <CommandMenuCheck />}
          </CommandMenuItem>
        )
      }}
    />
  )
}
