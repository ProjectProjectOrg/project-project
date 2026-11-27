import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import { isEpic, canJoinSprint } from "@pp/shared"
import type { ArchiveTicketInput, Member, Ticket, TicketId } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import {
  DropdownMenu,
  DropdownMenuConfirmItem,
  DropdownMenuContent,
  PointerMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import {
  Archive,
  ArchiveRestore,
  CircleSlash,
  Flag,
  FlagOff,
  MoreHorizontal,
  Split,
  Trash2
} from "@pp/ui/icons"
import { Popover } from "@pp/ui/popover"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  cloneElement,
  Fragment,
  useContext,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type RefObject
} from "react"

import { fireMutation } from "@/api/viewMutation"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  removeTicketFromSprint,
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { SubscribeMenuItem } from "@/features/subscriptions/components/SubscribeMenuItem"
import { useCanSubscribe } from "@/features/subscriptions/hooks/useCanSubscribe"
import type { RelatedKind } from "@/features/tickets/atoms/createTicket"
import type { MarkRowRelation } from "@/features/tickets/atoms/markRowRelation"
import type { RemoveTickets } from "@/features/tickets/atoms/removeTickets"
import { runTicketRemoval } from "@/features/tickets/atoms/runTicketRemoval"
import {
  archiveTicket,
  ticketRequest,
  unarchiveTicket
} from "@/features/tickets/atoms/ticketDetail"
import { CreateTicketForm } from "@/features/tickets/components/create-ticket/CreateTicketForm"
import { FlagTicket } from "@/features/tickets/components/FlagTicket"
import {
  useForgetTicket,
  useSelectionStore,
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
import { appHotkeys } from "@/lib/appHotkeys"
import { describeCause } from "@/lib/errorMessage"
import { keyLabels } from "@/lib/keyLabels"
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
  ticket: Ticket
  members: ReadonlyArray<Member>
  onPatch: (patch: TicketEdit) => void
  mark?: MarkRowRelation
  remove?: RemoveTickets
  onDeleted?: () => void
  template?: SaveAsTemplateProps
  fromList?: boolean
}>

type Flow = "archive" | "template" | "flag" | `related:${RelatedKind}` | null

const RELATED_FLOWS: Readonly<Record<string, RelatedKind>> = {
  "related:subTicket": "subTicket",
  "related:blocking": "blocking",
  "related:blockedBy": "blockedBy",
  "related:related": "related"
}

type ContextTarget = Readonly<{
  "data-popup-open"?: string
  onContextMenu?: (event: MouseEvent<HTMLElement>) => void
  onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void
}>

export function TicketContextMenu({
  children,
  ...menu
}: TicketMenuProps & Readonly<{ children: ReactElement<ContextTarget> }>) {
  const context = useTicketContextMenu()
  return (
    <>
      {cloneElement(children, {
        "data-popup-open": context.open ? "" : undefined,
        onContextMenu: context.openAt,
        onKeyDown: (event) => {
          children.props.onKeyDown?.(event)
          context.onKeyDown(event)
        }
      })}
      <TicketPointerMenu {...menu} context={context} />
    </>
  )
}

export function TicketPointerMenu({
  context,
  ...menu
}: TicketMenuProps &
  Readonly<{ context: ReturnType<typeof useTicketContextMenu> }>) {
  const [flow, setFlow] = useState<Flow>(null)
  return (
    <>
      <DropdownMenu open={context.open} onOpenChange={context.onOpenChange}>
        <PointerMenuContent
          anchor={context.anchor ?? undefined}
          instant={context.instant}
          className="w-52"
          flyoutSubmenus
          onContextMenu={context.suppressNativeMenu}
        >
          <TicketMenuItems {...menu} onFlow={setFlow} />
        </PointerMenuContent>
      </DropdownMenu>
      <TicketMenuFlows
        {...menu}
        flow={flow}
        onFlow={setFlow}
        anchor={context.anchor}
      />
    </>
  )
}

export function TicketMenuButton(menu: TicketMenuProps) {
  const trigger = useRef<HTMLButtonElement>(null)
  const [flow, setFlow] = useState<Flow>(null)
  return (
    <>
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
    </>
  )
}

function TicketMenuItems({
  ticket,
  members,
  onPatch,
  template,
  remove,
  mark,
  fromList = false,
  onDeleted,
  onFlow
}: TicketMenuProps & Readonly<{ onFlow: (flow: Flow) => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const can = ticketPermissions(useProjectActor())
  const subscribable = useCanSubscribe()
  const registry = useContext(RegistryContext)
  const archived = ticket.archivedAt !== null
  const canPlan = can.planSprints && canJoinSprint(ticket.type)
  const openPage = useOpenTicketPage(
    ticket.id,
    fromList ? { row: ticket, patch: onPatch, remove, mark } : undefined
  )
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
            onClick={() => onFlow("flag")}
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
          <CreateRelatedSubmenu
            ticket={ticket}
            canAttach={can.edit}
            onCreate={(kind) => onFlow(`related:${kind}`)}
          />
        )}
        {!archived && can.edit && (
          <MarkAsSubmenu
            onMark={(kind) => openPage(`mark:${kind}`)}
            flagged={ticket.flag !== null}
            onFlag={() => onFlow("flag")}
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
    single && subscribable && (
      <Fragment key="subscribe">
        <SubscribeMenuItem ticketId={ticket.id} />
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
              onClick={() => {
                if (remove)
                  void remove(registry, {
                    kind: "unarchive",
                    tickets: [ticket.id]
                  })
                else
                  void fireMutation(
                    registry,
                    unarchiveTicket(ticketRequest(orgSlug, slug, ticket.id)),
                    undefined
                  )
              }}
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
              <DropdownMenuShortcut
                keys={appHotkeys["tickets.archive"].defaultHotkey}
                keyLabels={keyLabels()}
              />
            </DropdownMenuItem>
          ))}
      </Fragment>
    ),
    can.delete && (
      <DeleteTicketItems
        key="delete"
        remove={remove}
        ticket={ticket}
        onDeleted={onDeleted}
      />
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

// Delete, confirmed in place. With a selection it deletes the selection;
// a ticket with sub-tickets gets a second item that deletes them too
// (an epic's are its tickets).
function DeleteTicketItems({
  ticket,
  onDeleted,
  remove
}: Pick<TicketMenuProps, "ticket" | "onDeleted" | "remove">) {
  const { orgSlug, slug } = useProjectRoute()
  const registry = useContext(RegistryContext)
  const store = useSelectionStore()
  const run = (tickets: ReadonlyArray<TicketId>, cascadeSubTickets = false) =>
    runTicketRemoval(
      registry,
      { orgSlug, slug },
      { kind: "delete", tickets, cascadeSubTickets },
      (id) =>
        tickets.length > 1
          ? (store?.views.get(selectionKey(slug, id))?.remove ?? remove)
          : remove
    )
  const selection = useSelectionActions(selectionKey(slug, ticket.id))
  const forget = useForgetTicket(selectionKey(slug, ticket.id))
  const icon = <Trash2 className="size-4" strokeWidth={1.75} />

  if (selection.count > 1) {
    const count = selection.count
    return (
      <DropdownMenuConfirmItem
        icon={icon}
        label={m.tickets_row_delete_many_menu_item({ count })}
        confirmLabel={m.tickets_row_delete_many_confirm({ count })}
        describeError={describeCause}
        busyLabel={m.common_deleting_button()}
        onConfirm={() => {
          const result = run(selection.selectedIds())
          selection.clear()
          onDeleted?.()
          return result
        }}
      />
    )
  }

  const removeOne = (cascade: boolean) => () => {
    const result = run([ticket.id], cascade)
    forget(cascade)
    onDeleted?.()
    return result
  }
  const count = ticket.subTicketCount ?? 0
  const epic = isEpic(ticket)
  return (
    <>
      <DropdownMenuConfirmItem
        icon={icon}
        label={m.tickets_row_delete_menu_item()}
        confirmLabel={m.tickets_row_delete_confirm()}
        describeError={describeCause}
        busyLabel={m.common_deleting_button()}
        onConfirm={removeOne(false)}
      />
      {count > 0 && (
        <DropdownMenuConfirmItem
          icon={icon}
          label={
            epic
              ? m.tickets_row_delete_with_tickets_menu_item({ count })
              : m.tickets_row_delete_with_sub_tickets_menu_item({ count })
          }
          confirmLabel={
            epic
              ? m.tickets_row_delete_with_tickets_confirm({ count })
              : m.tickets_row_delete_with_sub_tickets_confirm({ count })
          }
          describeError={describeCause}
          busyLabel={m.common_deleting_button()}
          onConfirm={removeOne(true)}
        />
      )}
    </>
  )
}

type TicketMenuFlowsProps = TicketMenuProps &
  Readonly<{
    flow: Flow
    onFlow: (flow: Flow) => void
    anchor: Anchor | RefObject<HTMLElement | null> | null
  }>

function TicketMenuFlows(props: TicketMenuFlowsProps) {
  const needed = props.flow !== null
  const [used, setUsed] = useState(needed)
  if (needed && !used) setUsed(true)
  return used ? <TicketMenuFlowPopovers {...props} /> : null
}

function TicketMenuFlowPopovers({
  ticket,
  remove,
  template,
  flow,
  onFlow,
  anchor
}: TicketMenuFlowsProps) {
  const { orgSlug, slug } = useProjectRoute()
  const req = ticketRequest(orgSlug, slug, ticket.id)
  const registry = useContext(RegistryContext)
  const store = useSelectionStore()
  const archive = useAtomSet(archiveTicket(req), { mode: "promiseExit" })
  const archiveState = useAtomValue(archiveTicket(req))
  const selection = useSelectionActions(selectionKey(slug, ticket.id))
  const many = selection.count > 1
  const project = { orgSlug, slug }
  const popupAnchor = anchor ?? undefined
  const forget = useForgetTicket(selectionKey(slug, ticket.id))
  const relatedKind = flow === null ? undefined : RELATED_FLOWS[flow]

  const archiveAndClose = async (input: ArchiveTicketInput) => {
    if (remove || many) {
      const tickets = many ? selection.selectedIds() : [ticket.id]
      const result = runTicketRemoval(
        registry,
        project,
        { kind: "archive", tickets, ...input },
        (id) =>
          many
            ? (store?.views.get(selectionKey(slug, id))?.remove ?? remove)
            : remove
      )
      if (many) selection.clear()
      else forget(false)
      onFlow(null)
      return result
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
            waiting={archiveState.waiting}
            failed={Result.isFailure(archiveState)}
            onClose={() => onFlow(null)}
          />
        </Composer.Popover>
      </Popover>
      <Popover
        open={flow === "flag"}
        onOpenChange={(open) => onFlow(open ? "flag" : null)}
      >
        <Composer.Popover
          anchor={popupAnchor}
          align="end"
          sideOffset={6}
          onClick={(event) => event.stopPropagation()}
        >
          <FlagTicket
            request={{
              orgSlug,
              slug,
              ticketId: ticket.id,
              title: ticket.title,
              selection: many ? selection.selectedIds() : []
            }}
            onDone={() => onFlow(null)}
          />
        </Composer.Popover>
      </Popover>
      <Popover
        open={relatedKind !== undefined}
        onOpenChange={(open) => {
          if (!open) onFlow(null)
        }}
      >
        <Composer.Popover
          anchor={popupAnchor}
          align="end"
          sideOffset={6}
          aria-label={m.tickets_create_dialog_title()}
          onClick={(event) => event.stopPropagation()}
        >
          {relatedKind !== undefined && (
            <CreateTicketForm
              request={{
                orgSlug,
                projectSlug: slug,
                related: { kind: relatedKind, ticketId: ticket.id }
              }}
              onDone={() => onFlow(null)}
            />
          )}
        </Composer.Popover>
      </Popover>
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
