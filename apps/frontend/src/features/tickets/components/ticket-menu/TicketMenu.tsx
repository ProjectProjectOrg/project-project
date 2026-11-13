import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { isEpic, canJoinSprint } from "@pp/shared"
import type { ArchiveTicketInput, Member, Ticket, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  Archive,
  ArchiveRestore,
  CircleSlash,
  Flag,
  FlagOff,
  MoreHorizontal,
  Split,
  Trash2
} from "lucide-react"
import {
  cloneElement,
  Fragment,
  useContext,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type RefObject
} from "react"

import { fireMutation } from "@/api/viewMutation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Composer } from "@/components/ui/composer"
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Popover } from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  removeTicketFromSprint,
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  bulkArchiveTickets,
  bulkDeleteTickets
} from "@/features/tickets/atoms/bulkTickets"
import { flagTicketDialog } from "@/features/tickets/atoms/flagTicketDialog"
import {
  archiveTicket,
  deleteTicket,
  ticketRequest,
  unarchiveTicket
} from "@/features/tickets/atoms/ticketDetail"
import {
  useForgetTicket,
  useSelectionActions
} from "@/features/tickets/components/ticket-list/TicketSelection"
import {
  MarkAsSubmenu,
  RelationsSubmenu
} from "@/features/tickets/components/ticket-marks/MarkAsSubmenu"
import {
  SaveAsTemplateMenuItem,
  SaveAsTemplatePopover
} from "@/features/tickets/components/ticket-page/SaveAsTemplatePopover"
import { ArchiveForm } from "@/features/tickets/forms/archive-ticket"
import type { SaveAsTemplateProps } from "@/features/tickets/forms/save-as-template"
import { sharedTicketFields } from "@/features/tickets/lib/sharedTicketFields"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { ticketPermissions } from "@/features/tickets/lib/ticketPermissions"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { BranchSubmenu } from "./BranchSubmenu"
import { CopySubmenu } from "./CopySubmenu"
import { CreateRelatedSubmenu } from "./CreateRelatedSubmenu"
import { MorePropertiesSubmenu } from "./MorePropertiesSubmenu"
import { MoveToSubmenu } from "./MoveToSubmenu"
import { TicketPropertySubmenus } from "./TicketPropertySubmenus"
import { useOpenTicketPage } from "./useOpenTicketPage"
import { type Anchor, useTicketContextMenu } from "./useTicketContextMenu"

export type TicketMenuTicket = Pick<
  Ticket,
  | "id"
  | "title"
  | "branch"
  | "repoId"
  | "pr"
  | "status"
  | "priority"
  | "type"
  | "assignees"
  | "tags"
  | "archivedAt"
  | "parent"
  | "subTicketCount"
  | "flag"
>

export type TicketMenuProps = Readonly<{
  ticket: TicketMenuTicket
  members: ReadonlyArray<Member>
  onPatch: (patch: TicketEdit) => void
  onDeleted?: () => void
  template?: SaveAsTemplateProps
  fromList?: boolean
}>

type Flow = "archive" | "template" | null

type ContextTarget = Readonly<{
  "data-popup-open"?: string
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}>

export function TicketContextMenu({
  children,
  ...menu
}: TicketMenuProps & Readonly<{ children: ReactElement<ContextTarget> }>) {
  const {
    anchor,
    open,
    instant,
    openAt,
    onKeyDown,
    onOpenChange,
    suppressNativeMenu
  } = useTicketContextMenu()
  const [flow, setFlow] = useState<Flow>(null)
  return (
    <ConfirmButton.Root bare>
      {cloneElement(children, {
        "data-popup-open": open ? "" : undefined,
        onContextMenu: openAt,
        onKeyDown: (event) => {
          children.props.onKeyDown?.(event)
          onKeyDown(event)
        }
      })}
      <DropdownMenu open={open} onOpenChange={onOpenChange}>
        <DropdownMenuContent
          anchor={anchor ?? undefined}
          side="bottom"
          align="start"
          sideOffset={2}
          collisionAvoidance={{ side: "shift", align: "shift" }}
          className="w-52"
          style={instant ? { animation: "none" } : undefined}
          onContextMenu={suppressNativeMenu}
        >
          <TicketMenuItems {...menu} onFlow={setFlow} />
        </DropdownMenuContent>
      </DropdownMenu>
      <TicketMenuFlows {...menu} flow={flow} onFlow={setFlow} anchor={anchor} />
    </ConfirmButton.Root>
  )
}

export function TicketMenuButton(menu: TicketMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [flow, setFlow] = useState<Flow>(null)
  return (
    <ConfirmButton.Root bare>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              ref={trigger}
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={m.tickets_row_actions_aria_label()}
              onClick={(event) => event.stopPropagation()}
              className="shrink-0"
            >
              <MoreHorizontal strokeWidth={1.75} />
            </Button>
          }
        />
        <DropdownMenuContent align="end" sideOffset={6} className="w-52">
          <TicketMenuItems {...menu} onFlow={setFlow} />
        </DropdownMenuContent>
      </DropdownMenu>
      <TicketMenuFlows
        {...menu}
        flow={flow}
        onFlow={setFlow}
        anchor={trigger}
      />
    </ConfirmButton.Root>
  )
}

function TicketMenuItems({
  ticket,
  members,
  onPatch,
  template,
  fromList = false,
  onFlow
}: TicketMenuProps & Readonly<{ onFlow: (flow: Flow) => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const can = ticketPermissions(useProjectActor())
  const registry = useContext(RegistryContext)
  const archived = ticket.archivedAt !== null
  const canPlan = can.planSprints && canJoinSprint(ticket.type)
  const openPage = useOpenTicketPage(ticket.id)
  const openFlagDialog = useAtomSet(flagTicketDialog)
  const parent = ticket.parent ?? null
  const detachable = parent !== null && can.edit
  const { count, selectedTickets } = useSelectionActions(
    selectionKey(slug, ticket.id)
  )
  const single = count === 1
  const checks = single
    ? ticket
    : { ...sharedTicketFields(selectedTickets), id: ticket.id }
  const sections = [
    !archived && (can.edit || can.assign || canPlan || can.move) && (
      <Fragment key="properties">
        <TicketPropertySubmenus
          ticket={checks}
          unassigned={(single ? [ticket] : selectedTickets).every(
            (each) => each.assignees.length === 0
          )}
          members={members}
          editable={can.edit}
          canAssign={can.assign}
          onPatch={onPatch}
        />
        <MoveToSubmenu
          onSprint={canPlan ? () => openPage("ticketSprint") : undefined}
          onProject={
            single && can.move ? () => openPage("ticketMove") : undefined
          }
        />
        {single && canPlan && <RemoveFromSprintItem ticketId={ticket.id} />}
        {!single && can.edit && (
          <DropdownMenuItem
            onClick={() =>
              openFlagDialog({
                orgSlug,
                slug,
                ticketId: ticket.id,
                title: ticket.title,
                selection: selectedTickets.map((each) => each.id)
              })
            }
            className="cursor-pointer"
          >
            <Flag className="size-4" strokeWidth={1.75} />
            {m.tickets_menu_flag_many({ count })}
          </DropdownMenuItem>
        )}
        {!single &&
          can.edit &&
          selectedTickets.some((each) => each.flag !== null) && (
            <DropdownMenuItem
              onClick={() => onPatch({ flag: null })}
              className="cursor-pointer"
            >
              <FlagOff className="size-4" strokeWidth={1.75} />
              {m.tickets_menu_unflag_many()}
            </DropdownMenuItem>
          )}
        {single && can.edit && <MorePropertiesSubmenu ticket={ticket} />}
      </Fragment>
    ),
    single && ((!archived && (can.edit || can.create)) || detachable) && (
      <Fragment key="relations">
        {!archived && can.create && (
          <CreateRelatedSubmenu ticket={ticket} canAttach={can.edit} />
        )}
        {!archived && can.edit && (
          <MarkAsSubmenu
            ticketId={ticket.id}
            flagged={ticket.flag !== null}
            onFlag={() =>
              openFlagDialog({
                orgSlug,
                slug,
                ticketId: ticket.id,
                title: ticket.title,
                selection: []
              })
            }
            onUnflag={() => onPatch({ flag: null })}
          />
        )}
        <RelationsSubmenu
          ticketId={ticket.id}
          parent={parent}
          canDetach={can.edit}
          canUnmark={!archived && can.edit}
          onPatch={onPatch}
        />
      </Fragment>
    ),
    single && (
      <Fragment key="copy">
        <CopySubmenu ticket={ticket} />
        <BranchSubmenu
          ticket={ticket}
          canStack={!archived && can.stackBranch}
          canUnlink={!archived && can.clearBranch}
        />
      </Fragment>
    ),
    ((single && ((!archived && can.split) || template !== undefined)) ||
      can.archive) && (
      <Fragment key="actions">
        {single && !archived && can.split && (
          <DropdownMenuItem
            render={
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id/split"
                params={{ orgSlug, slug, id: ticket.id }}
                search={fromList ? { from: "list" } : {}}
                className="cursor-pointer"
              />
            }
          >
            <Split className="size-4" strokeWidth={1.75} />
            {m.tickets_split_menu_item()}
          </DropdownMenuItem>
        )}
        {single && template !== undefined && (
          <SaveAsTemplateMenuItem onSelect={() => onFlow("template")} />
        )}
        {can.archive &&
          (archived && single ? (
            <DropdownMenuItem
              onClick={() =>
                void fireMutation(
                  registry,
                  unarchiveTicket(ticketRequest(orgSlug, slug, ticket.id)),
                  undefined
                )
              }
              className="cursor-pointer"
            >
              <ArchiveRestore className="size-4" strokeWidth={1.75} />
              {m.tickets_unarchive_button()}
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem
              onClick={() => onFlow("archive")}
              className="cursor-pointer"
            >
              <Archive className="size-4" strokeWidth={1.75} />
              {single
                ? m.tickets_archive_submit()
                : m.tickets_row_archive_many_menu_item({ count })}
            </DropdownMenuItem>
          ))}
      </Fragment>
    ),
    can.delete && (
      <ConfirmButton.MenuItem
        key="delete"
        variant="destructive"
        className="cursor-pointer"
      >
        <Trash2 className="size-4" strokeWidth={1.75} />
        {single
          ? m.tickets_row_delete_menu_item()
          : m.tickets_row_delete_many_menu_item({ count })}
      </ConfirmButton.MenuItem>
    )
  ].filter((section) => section !== false)
  return sections.map((section, index) => (
    <Fragment key={section.key}>
      {index > 0 && <DropdownMenuSeparator />}
      {section}
    </Fragment>
  ))
}

function RemoveFromSprintItem({ ticketId }: Readonly<{ ticketId: TicketId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const req = sprintListRequest(orgSlug, slug)
  const membership = useAtomValue(sprintMembership(req))
  const sprint = Result.isSuccess(membership)
    ? membership.value.get(ticketId)
    : undefined
  if (sprint === undefined) return null
  return (
    <DropdownMenuItem
      onClick={() => removeTicketFromSprint(registry, req, ticketId, sprint.id)}
      className="cursor-pointer"
    >
      <CircleSlash className="size-4" strokeWidth={1.75} />
      {m.tickets_command_remove_from_sprint()}
    </DropdownMenuItem>
  )
}

type TicketMenuFlowsProps = TicketMenuProps &
  Readonly<{
    flow: Flow
    onFlow: (flow: Flow) => void
    anchor: Anchor | RefObject<HTMLElement | null> | null
  }>

function TicketMenuFlows(props: TicketMenuFlowsProps) {
  const { active } = useConfirmButton()
  const needed = props.flow !== null || active !== null
  const [used, setUsed] = useState(needed)
  if (needed && !used) setUsed(true)
  return used ? <TicketMenuFlowPopovers {...props} /> : null
}

function TicketMenuFlowPopovers({
  ticket,
  onDeleted,
  template,
  flow,
  onFlow,
  anchor
}: TicketMenuFlowsProps) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const archive = useAtomSet(archiveTicket(req), { mode: "promiseExit" })
  const archiveState = useAtomValue(archiveTicket(req))
  const remove = useAtomSet(deleteTicket(req), { mode: "promiseExit" })
  const removeState = useAtomValue(deleteTicket(req))
  const selection = useSelectionActions(selectionKey(slug, ticket.id))
  const many = selection.count > 1
  const project = { orgSlug, slug }
  const archiveMany = useAtomSet(bulkArchiveTickets(project), {
    mode: "promiseExit"
  })
  const archiveManyState = useAtomValue(bulkArchiveTickets(project))
  const removeMany = useAtomSet(bulkDeleteTickets(project), {
    mode: "promiseExit"
  })
  const removeManyState = useAtomValue(bulkDeleteTickets(project))
  const [cascade, setCascade] = useState(false)
  const cascadeId = useId()
  const subTickets = ticket.subTicketCount ?? 0
  const popupAnchor = anchor ?? undefined
  const forget = useForgetTicket(selectionKey(slug, ticket.id))

  const archiveAndClose = async (input: ArchiveTicketInput) => {
    if (many) {
      const exit = await archiveMany({
        tickets: selection.selectedIds(),
        reason: input.reason
      })
      if (Exit.isSuccess(exit)) {
        selection.clear()
        onFlow(null)
      }
      return exit
    }
    const exit = await archive(input)
    if (Exit.isSuccess(exit)) {
      forget(false)
      onFlow(null)
    }
    return exit
  }

  return (
    <>
      <Popover
        open={flow === "archive"}
        onOpenChange={(open) => onFlow(open ? "archive" : null)}
      >
        <Composer.Popover
          anchor={popupAnchor}
          align="end"
          sideOffset={6}
          onClick={(event) => event.stopPropagation()}
        >
          <ArchiveForm
            ticket={ticket}
            onArchive={archiveAndClose}
            waiting={(many ? archiveManyState : archiveState).waiting}
            failed={
              many
                ? Result.isFailure(archiveManyState)
                : Result.isFailure(archiveState)
            }
            onClose={() => onFlow(null)}
          />
        </Composer.Popover>
      </Popover>
      <ConfirmButton.Popover anchor={popupAnchor} className="w-72">
        <ConfirmButton.Action
          layout="stacked"
          prompt={
            many
              ? m.tickets_row_delete_many_confirm({ count: selection.count })
              : m.tickets_row_delete_confirm()
          }
          description={m.tickets_row_delete_description()}
          label={m.common_delete_confirm_button()}
          waiting={(many ? removeManyState : removeState).waiting}
          error={
            (
              many
                ? Result.isFailure(removeManyState)
                : Result.isFailure(removeState)
            )
              ? many
                ? m.tickets_row_delete_many_error_fallback()
                : m.tickets_row_delete_error_fallback()
              : null
          }
          onConfirm={async () => {
            if (many) {
              const exit = await removeMany({
                tickets: selection.selectedIds()
              })
              if (Exit.isSuccess(exit)) selection.clear()
              return exit
            }
            const exit = await remove({ cascadeSubTickets: cascade })
            if (Exit.isSuccess(exit)) {
              forget(cascade)
              onDeleted?.()
            }
            return exit
          }}
        >
          {!many && subTickets > 0 && (
            <label
              htmlFor={cascadeId}
              className="flex cursor-pointer items-center gap-2 text-caption text-muted-foreground"
            >
              <Checkbox
                id={cascadeId}
                checked={cascade}
                onCheckedChange={setCascade}
              />
              {isEpic(ticket)
                ? m.tickets_detail_delete_cascade_tickets({ count: subTickets })
                : m.tickets_detail_delete_cascade_sub_tickets({
                    count: subTickets
                  })}
            </label>
          )}
        </ConfirmButton.Action>
      </ConfirmButton.Popover>
      {template !== undefined && (
        <SaveAsTemplatePopover
          {...template}
          open={flow === "template"}
          onOpenChange={(open) => onFlow(open ? "template" : null)}
          anchor={popupAnchor}
          finalFocus={false}
        />
      )}
    </>
  )
}
