import { RegistryContext, useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ArchiveTicketInput, Member, Ticket } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Exit from "effect/Exit"
import * as Result from "effect/reactivity/AsyncResult"
import {
  Archive,
  ArchiveRestore,
  MoreHorizontal,
  Split,
  Trash2,
  Unlink
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
import { ConfirmButton, useConfirmButton } from "@/components/ui/confirm-button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { Popover, PopoverContent } from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  archiveTicket,
  deleteTicket,
  ticketRequest,
  unarchiveTicket
} from "@/features/tickets/atoms/ticketDetail"
import { ArchiveForm } from "@/features/tickets/components/ticket-list/ArchiveControl"
import { MoveTicketForm } from "@/features/tickets/components/ticket-list/MoveControl"
import {
  MarkAsSubmenu,
  RelationsSubmenu
} from "@/features/tickets/components/ticket-marks/MarkAsSubmenu"
import {
  SaveAsTemplateMenuItem,
  SaveAsTemplatePopover
} from "@/features/tickets/components/ticket-page/SaveAsTemplatePopover"
import { TicketIdText } from "@/features/tickets/components/TicketIdText"
import type { SaveAsTemplateProps } from "@/features/tickets/forms/save-as-template"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { ticketPermissions } from "@/features/tickets/lib/ticketPermissions"
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
  | "pr"
  | "status"
  | "priority"
  | "type"
  | "assignees"
  | "tags"
  | "archivedAt"
  | "parent"
  | "subTicketCount"
>

export type TicketMenuProps = Readonly<{
  ticket: TicketMenuTicket
  members: ReadonlyArray<Member>
  onPatch: (patch: TicketEdit) => void
  onDeleted?: () => void
  template?: SaveAsTemplateProps
  fromList?: boolean
}>

type Flow = "archive" | "move" | "template" | null

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
  const canPlan = can.planSprints && ticket.type !== "epic"
  const openPage = useOpenTicketPage(ticket.id)
  const parent = ticket.parent ?? null
  const detachable = parent !== null && can.edit
  const sections = [
    !archived && (can.edit || can.assign || canPlan || can.move) && (
      <Fragment key="properties">
        <TicketPropertySubmenus
          ticket={ticket}
          members={members}
          editable={can.edit}
          canAssign={can.assign}
          onPatch={onPatch}
        />
        <MoveToSubmenu
          onSprint={canPlan ? () => openPage("ticketSprint") : undefined}
          onProject={can.move ? () => onFlow("move") : undefined}
        />
        {can.edit && <MorePropertiesSubmenu ticket={ticket} />}
      </Fragment>
    ),
    ((!archived && (can.edit || can.create)) || detachable) && (
      <Fragment key="relations">
        {!archived && can.create && (
          <CreateRelatedSubmenu ticket={ticket} canAttach={can.edit} />
        )}
        {!archived && can.edit && <MarkAsSubmenu ticketId={ticket.id} />}
        {!archived && can.edit && <RelationsSubmenu ticketId={ticket.id} />}
        {detachable && (
          <DropdownMenuItem
            onClick={() => onPatch({ parent: null })}
            className="cursor-pointer"
          >
            <Unlink className="size-4" strokeWidth={1.75} />
            <TicketIdText id={parent.id}>
              {m.tickets_row_detach_action({ id: parent.id })}
            </TicketIdText>
          </DropdownMenuItem>
        )}
      </Fragment>
    ),
    <Fragment key="copy">
      <CopySubmenu ticket={ticket} />
      <BranchSubmenu
        ticket={ticket}
        canStack={!archived && can.stackBranch}
        canUnlink={!archived && can.clearBranch}
      />
    </Fragment>,
    (can.split || template !== undefined || can.archive) && (
      <Fragment key="actions">
        {can.split && (
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
        {template !== undefined && (
          <SaveAsTemplateMenuItem onSelect={() => onFlow("template")} />
        )}
        {can.archive &&
          (archived ? (
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
              {m.tickets_archive_submit()}
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
        {m.tickets_row_delete_menu_item()}
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
  const [reason, setReason] = useState("")
  const [cascade, setCascade] = useState(false)
  const cascadeId = useId()
  const subTickets = ticket.subTicketCount ?? 0
  const popupAnchor = anchor ?? undefined

  const archiveAndClose = async (input: ArchiveTicketInput) => {
    const exit = await archive(input)
    if (Exit.isSuccess(exit)) onFlow(null)
    return exit
  }

  return (
    <>
      <Popover
        open={flow === "archive"}
        onOpenChange={(open) => onFlow(open ? "archive" : null)}
        onOpenChangeComplete={(open) => {
          if (!open) setReason("")
        }}
      >
        <PopoverContent
          anchor={popupAnchor}
          align="end"
          sideOffset={6}
          className="w-72"
          onClick={(event) => event.stopPropagation()}
        >
          <ArchiveForm
            reason={reason}
            onReasonChange={setReason}
            onArchive={archiveAndClose}
            waiting={archiveState.waiting}
            failed={Result.isFailure(archiveState)}
            onClose={() => onFlow(null)}
          />
        </PopoverContent>
      </Popover>
      <Popover
        open={flow === "move"}
        onOpenChange={(open) => onFlow(open ? "move" : null)}
      >
        <PopoverContent
          anchor={popupAnchor}
          align="end"
          sideOffset={6}
          className="w-80"
          onClick={(event) => event.stopPropagation()}
        >
          {flow === "move" && (
            <MoveTicketForm id={ticket.id} onClose={() => onFlow(null)} />
          )}
        </PopoverContent>
      </Popover>
      <ConfirmButton.Popover anchor={popupAnchor} className="w-72">
        <ConfirmButton.Action
          layout="stacked"
          prompt={m.tickets_row_delete_confirm()}
          description={m.tickets_row_delete_description()}
          label={m.common_delete_confirm_button()}
          waiting={removeState.waiting}
          error={
            Result.isFailure(removeState)
              ? m.tickets_row_delete_error_fallback()
              : null
          }
          onConfirm={async () => {
            const exit = await remove({ cascadeSubTickets: cascade })
            if (Exit.isSuccess(exit)) onDeleted?.()
            return exit
          }}
        >
          {subTickets > 0 && (
            <label
              htmlFor={cascadeId}
              className="flex cursor-pointer items-center gap-2 text-caption text-muted-foreground"
            >
              <Checkbox
                id={cascadeId}
                checked={cascade}
                onCheckedChange={setCascade}
              />
              {ticket.type === "epic"
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
