import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  estimationUnit,
  listEditBetween,
  type Member,
  type Ticket
} from "@pp/shared"
import { DropdownMenu, PointerMenuContent } from "@pp/ui/dropdown-menu"
import { Popover } from "@pp/ui/popover"
import * as Result from "effect/reactivity/AsyncResult"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import type { ProjectRequest } from "@/features/projects/atoms/projects"
import { statusesFor } from "@/features/projects/atoms/projectStatuses"
import {
  ProjectContext,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import { useGitMenu } from "@/features/sprints/components/BoardCardGit"
import { TagMenu } from "@/features/sprints/components/BoardCardProperties"
import {
  GitMenuItems,
  GitStackPicker
} from "@/features/sprints/components/GitChipMenu"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { TicketPointerMenu } from "@/features/tickets/components/ticket-menu/TicketMenu"
import type { useTicketContextMenu } from "@/features/tickets/components/ticket-menu/useTicketContextMenu"
import { TicketHoverCard } from "@/features/tickets/components/TicketHoverCard"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { sharedTicketFields } from "@/features/tickets/lib/sharedTicketFields"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import type { TicketNavigationSearch } from "@/features/tickets/lib/ticketSearch"

import { AssigneeMenuContent } from "./AssigneeField"
import { EstimatePopoverContent, SizeMenuContent } from "./EstimateField"
import { PriorityMenuContent } from "./PriorityField"
import { SprintFieldMenu } from "./SprintField"
import { StatusMenuContent } from "./StatusField"
import { useSelectionActions } from "./TicketSelection"

export type RowSource = Readonly<{
  ticket: Ticket
  members: ReadonlyArray<Member>
  update: TicketUpdates
  editable: boolean
  key: string
  project: ProjectRequest
  search: TicketNavigationSearch | undefined
}>

export type Target = Readonly<{
  source: RowSource
  row: HTMLElement
  anchor: HTMLElement
}>

export type FieldMenuState = Target &
  Readonly<{
    kind: keyof typeof FIELD_MENUS
    open: boolean
    id: number
  }>

export type PreviewState = Target & Readonly<{ open: boolean }>

type MenuProps = Readonly<{
  menu: FieldMenuState
  onOpenChange: (open: boolean) => void
}>

type ContextMenu = ReturnType<typeof useTicketContextMenu>

export function RowScope({
  source,
  children
}: Readonly<{ source: RowSource; children: ReactNode }>) {
  return (
    <ProjectContext value={source.project}>
      <TicketViewSourceContext value={source.search}>
        {children}
      </TicketViewSourceContext>
    </ProjectContext>
  )
}

function useRowPatch(source: RowSource) {
  const selection = useSelectionActions(source.key)
  const patchRow = useAtomSet(source.update.patch(source.ticket.id))
  return {
    shared:
      selection.count > 1
        ? sharedTicketFields(selection.selectedTickets)
        : null,
    onPatch: (edit: TicketEdit) => {
      if (!selection.patch(edit)) patchRow(edit)
    }
  }
}

export function FieldMenu(props: MenuProps) {
  const Menu = FIELD_MENUS[props.menu.kind]
  return <Menu {...props} />
}

export const isFieldMenu = (
  kind: string | undefined
): kind is FieldMenuState["kind"] =>
  kind !== undefined && Object.hasOwn(FIELD_MENUS, kind)

function StatusMenu({ menu, onOpenChange }: MenuProps) {
  const { statusesReq } = useProjectRoute()
  const statuses = useAtomValue(statusesFor(statusesReq))
  const { shared, onPatch } = useRowPatch(menu.source)
  return (
    <DropdownMenu open={menu.open} onOpenChange={onOpenChange}>
      <StatusMenuContent
        anchor={menu.anchor}
        finalFocus={() => menu.anchor}
        statuses={Result.isSuccess(statuses) ? statuses.value : []}
        selected={
          shared === null ? menu.source.ticket.status : (shared.status ?? null)
        }
        onChange={(status) => onPatch({ status })}
        manageAction
      />
    </DropdownMenu>
  )
}

function PriorityMenu({ menu, onOpenChange }: MenuProps) {
  const { shared, onPatch } = useRowPatch(menu.source)
  return (
    <DropdownMenu open={menu.open} onOpenChange={onOpenChange}>
      <PriorityMenuContent
        anchor={menu.anchor}
        finalFocus={() => menu.anchor}
        value={
          shared === null
            ? menu.source.ticket.priority
            : (shared.priority ?? null)
        }
        onChange={(priority) => onPatch({ priority })}
      />
    </DropdownMenu>
  )
}

function AssigneeMenu({ menu, onOpenChange }: MenuProps) {
  const { onPatch } = useRowPatch(menu.source)
  const { assignees } = menu.source.ticket
  return (
    <DropdownMenu filterable open={menu.open} onOpenChange={onOpenChange}>
      <AssigneeMenuContent
        anchor={menu.anchor}
        finalFocus={() => menu.anchor}
        value={assignees}
        members={menu.source.members}
        onChange={(next) =>
          onPatch({ assignees: listEditBetween(assignees, next) })
        }
        onClear={() => onPatch({ assignees: [] })}
      />
    </DropdownMenu>
  )
}

function EstimateMenu({ menu, onOpenChange }: MenuProps) {
  const unit = estimationUnit(useEstimationMode())
  const { onPatch } = useRowPatch(menu.source)
  if (unit === null) return null
  return unit === "tshirt" ? (
    <DropdownMenu open={menu.open} onOpenChange={onOpenChange}>
      <SizeMenuContent
        anchor={menu.anchor}
        finalFocus={() => menu.anchor}
        ticket={menu.source.ticket}
        onPatch={onPatch}
      />
    </DropdownMenu>
  ) : (
    <Popover open={menu.open} onOpenChange={onOpenChange}>
      <EstimatePopoverContent
        anchor={menu.anchor}
        finalFocus={() => menu.anchor}
        unit={unit}
        ticket={menu.source.ticket}
        onSubmit={(estimate) => {
          onPatch({ estimate })
          onOpenChange(false)
        }}
      />
    </Popover>
  )
}

function SprintMenu({ menu, onOpenChange }: MenuProps) {
  return (
    <SprintFieldMenu
      ticketId={menu.source.ticket.id}
      open={menu.open}
      onOpenChange={onOpenChange}
      anchor={menu.anchor}
      finalFocus={() => menu.anchor}
    />
  )
}

function TagsMenu({ menu, onOpenChange }: MenuProps) {
  const { onPatch } = useRowPatch(menu.source)
  return (
    <TagMenu
      applied={menu.source.ticket.tags}
      onPatch={onPatch}
      open={menu.open}
      onOpenChange={onOpenChange}
      anchor={menu.anchor}
      finalFocus={() => menu.anchor}
    />
  )
}

const FIELD_MENUS = {
  status: StatusMenu,
  priority: PriorityMenu,
  assignee: AssigneeMenu,
  estimate: EstimateMenu,
  sprint: SprintMenu,
  tags: TagsMenu
} satisfies Readonly<Record<string, (props: MenuProps) => ReactNode>>

export function RowPreview({
  preview,
  onClose
}: Readonly<{ preview: PreviewState; onClose: () => void }>) {
  return (
    <Popover
      open={preview.open}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <TicketHoverCard
        ticketId={preview.source.ticket.id}
        scope={{
          ...preview.source.project.params,
          members: preview.source.members
        }}
        anchor={preview.row}
        interactive={false}
      />
    </Popover>
  )
}

export function RowTicketMenu({
  source,
  context
}: Readonly<{ source: RowSource; context: ContextMenu }>) {
  const { onPatch } = useRowPatch(source)
  return (
    <TicketPointerMenu
      ticket={source.ticket}
      members={source.members}
      onPatch={onPatch}
      remove={source.update.remove}
      mark={source.update.mark}
      fromList
      context={context}
    />
  )
}

export function RowGitMenu({
  target,
  context
}: Readonly<{ target: Target; context: ContextMenu }>) {
  const git = useGitMenu(target.source.ticket)
  const [stacking, setStacking] = useState(false)
  const chip = useRef(target.anchor)
  useLayoutEffect(() => {
    chip.current = target.anchor
  })
  if (git === null) return null
  return (
    <>
      <DropdownMenu open={context.open} onOpenChange={context.onOpenChange}>
        <PointerMenuContent
          anchor={context.anchor ?? undefined}
          instant={context.instant}
          className="w-56"
          onContextMenu={context.suppressNativeMenu}
        >
          <GitMenuItems {...git} onStack={() => setStacking(true)} />
        </PointerMenuContent>
      </DropdownMenu>
      <GitStackPicker
        {...git}
        anchor={chip}
        open={stacking}
        onOpenChange={setStacking}
      />
    </>
  )
}
