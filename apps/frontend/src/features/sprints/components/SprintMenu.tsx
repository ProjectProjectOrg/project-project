import { RegistryContext, useAtomSet } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  PointerMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from "@pp/ui/dropdown-menu"
import {
  CalendarX,
  ListPlus,
  Pencil,
  Play,
  RotateCcw,
  Trash2
} from "@pp/ui/icons"
import {
  cloneElement,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type RefObject
} from "react"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import {
  openSprintCommandMenu,
  type SprintPage
} from "@/features/command-menu/lib/commandMenu"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  deleteSprint,
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { nowDate, startSprintPatch } from "@/features/sprints/lib/sprintDates"
import { useTicketContextMenu } from "@/features/tickets/components/ticket-menu/useTicketContextMenu"
import { describeCause } from "@/lib/errorMessage"
import { m } from "@/paraglide/messages"

import { CompleteSprintSubmenu } from "./CompleteSprintMenu"
import { NewSprintPopover } from "./NewSprintPopover"

type ContextTarget = Readonly<{
  ref?: RefObject<HTMLDivElement | null>
  "data-popup-open"?: string
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}>

type Flow = "completeIntoNew" | null

export function SprintContextMenu({
  sprint,
  sprints,
  children
}: Readonly<{
  sprint: Group
  sprints: ReadonlyArray<Group>
  children: ReactElement<ContextTarget>
}>) {
  const {
    anchor,
    open,
    instant,
    openAt,
    onKeyDown,
    onOpenChange,
    suppressNativeMenu
  } = useTicketContextMenu()
  const row = useRef<HTMLDivElement>(null)
  const [flow, setFlow] = useState<Flow>(null)
  const closeFlow = (next: boolean) => {
    if (!next) setFlow(null)
  }
  return (
    <>
      {cloneElement(children, {
        ref: row,
        "data-popup-open": open || flow !== null ? "" : undefined,
        onContextMenu: openAt,
        onKeyDown: (event) => {
          children.props.onKeyDown?.(event)
          onKeyDown(event)
        }
      })}
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <PointerMenuContent
          anchor={anchor ?? undefined}
          instant={instant}
          className="w-56"
          onContextMenu={suppressNativeMenu}
        >
          <SprintMenuItems sprint={sprint} sprints={sprints} onFlow={setFlow} />
        </PointerMenuContent>
      </DropdownMenu>
      <NewSprintPopover
        anchor={row}
        open={flow === "completeIntoNew"}
        onOpenChange={closeFlow}
        completeFrom={sprint}
      />
    </>
  )
}

function SprintMenuItems({
  sprint,
  sprints,
  onFlow
}: Readonly<{
  sprint: Group
  sprints: ReadonlyArray<Group>
  onFlow: (flow: Flow) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const req = sprintListRequest(orgSlug, slug)
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }))
  const remove = useAtomSet(deleteSprint({ req, groupId: sprint.id }), {
    mode: "promiseExit"
  })
  const state = sprintState(sprint)
  const openPage = (page: SprintPage) =>
    registry.set(
      commandMenuState,
      openSprintCommandMenu({ orgSlug, slug, groupId: sprint.id }, page)
    )

  return (
    <>
      {state === "planned" && (
        <DropdownMenuItem
          onClick={() => update(startSprintPatch(sprint, nowDate()))}
        >
          <Play className="size-4" strokeWidth={1.75} />
          {m.sprints_start_button()}
        </DropdownMenuItem>
      )}
      {state === "active" && (
        <CompleteSprintSubmenu
          sprint={sprint}
          sprints={sprints}
          onNew={() => onFlow("completeIntoNew")}
        />
      )}
      {state === "completed" && (
        <DropdownMenuItem onClick={() => update({ completedAt: null })}>
          <RotateCcw className="size-4" strokeWidth={1.75} />
          {m.sprints_reopen_button()}
        </DropdownMenuItem>
      )}
      {state !== "completed" && (
        <>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => openPage("sprintEdit")}>
            <Pencil className="size-4" strokeWidth={1.75} />
            {m.sprints_edit_button()}
          </DropdownMenuItem>
          {state === "planned" && sprint.startsAt !== null && (
            <DropdownMenuItem
              onClick={() => update({ startsAt: null, endsAt: null })}
            >
              <CalendarX className="size-4" strokeWidth={1.75} />
              {m.sprints_unschedule()}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => openPage("sprintAddTickets")}>
            <ListPlus className="size-4" strokeWidth={1.75} />
            {m.sprints_command_add_tickets()}
          </DropdownMenuItem>
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuConfirmItem
        icon={<Trash2 className="size-4" strokeWidth={1.75} />}
        label={m.sprints_delete_button()}
        confirmLabel={m.sprints_delete_confirm_title()}
        busyLabel={m.common_deleting_button()}
        describeError={describeCause}
        onConfirm={() => remove(undefined)}
      />
    </>
  )
}
