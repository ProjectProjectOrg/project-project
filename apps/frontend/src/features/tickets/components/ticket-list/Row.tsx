import { useAtomSet, useAtomValue } from "@effect/atom-react"
import {
  estimationUnit,
  type Member,
  type ParentFilter,
  type Ticket,
  type TicketId
} from "@pp/shared"
import { Checkbox } from "@pp/ui/checkbox"
import { DeferredDropdownMenus } from "@pp/ui/dropdown-menu"
import { ItemLink } from "@pp/ui/item-link"
import { hasModifier, isKeyboardNavigating } from "@pp/ui/lib/keyboard"
import { ListRow, ListRowTitle } from "@pp/ui/list-row"
import { Popover, PopoverTrigger } from "@pp/ui/popover"
import { Reveal } from "@pp/ui/reveal"
import { TicketKey } from "@pp/ui/ticket-key"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import {
  type ComponentProps,
  type ReactNode,
  memo,
  use,
  useRef,
  useState
} from "react"

import { usePointedTicket } from "@/features/command-menu/hooks/usePointedTicket"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import { BoardCardGit } from "@/features/sprints/components/BoardCardGit"
import { TagChips } from "@/features/sprints/components/BoardCardProperties"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { TicketContextMenu } from "@/features/tickets/components/ticket-menu/TicketMenu"
import {
  FlagChip,
  RelationChips,
  SubTicketsChip
} from "@/features/tickets/components/ticket-preview/PreviewChips"
import { TicketHoverCard } from "@/features/tickets/components/TicketHoverCard"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { useDisplayProperties } from "@/features/tickets/hooks/useDisplayProperties"
import { useEstimationMode } from "@/features/tickets/hooks/useEstimationMode"
import { useShownTicket } from "@/features/tickets/hooks/useShownTicket"
import { sharedTicketFields } from "@/features/tickets/lib/sharedTicketFields"
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { m } from "@/paraglide/messages"

import { AssigneeField } from "./AssigneeField"
import { RowEstimate } from "./EstimateField"
import { ParentPrefix } from "./ParentPrefix"
import { PriorityButton } from "./PriorityField"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { useSelectionActions, useTicketSelection } from "./TicketSelection"
import { UpdateFailureMarker } from "./UpdateFailureMarker"

const TICKET_PREVIEW_DELAY_MS = 550

export type RowProps = Readonly<{
  update: TicketUpdates
  variant?: "standalone" | "embedded"
  titleVariant?: ComponentProps<typeof ListRowTitle>["variant"]
  ticket: Ticket
  members: ReadonlyArray<Member>
  contextParent?: ParentFilter
  showSprint?: boolean
  pending?: boolean
  editable?: boolean
  previewOpen: boolean
  onPreviewPointerEnter: (ticketId: Ticket["id"]) => void
  onPreviewOpenChange: (ticketId: Ticket["id"], open: boolean) => void
}>

function RowImpl({
  update,
  variant = "standalone",
  titleVariant,
  ticket,
  members,
  contextParent,
  showSprint = true,
  pending,
  editable = true,
  previewOpen,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: RowProps) {
  const { orgSlug, slug } = useProjectRoute()
  const from = use(TicketViewSourceContext)
  useShownTicket(orgSlug, slug, pending ? null : ticket.id, from)
  const patchRow = useAtomSet(update.patch(ticket.id))
  const rowElement = useRef<HTMLDivElement>(null)
  const estimation = useEstimationMode()
  const estimateUnit = estimationUnit(estimation)
  const { shows } = useDisplayProperties()
  const [previewMounted, setPreviewMounted] = useState(false)
  const navigating = () => isKeyboardNavigating(rowElement.current)
  const handleTitlePointerEnter = () => {
    if (navigating()) return
    onPreviewPointerEnter(ticket.id)
  }
  const handleTitlePointerLeave = () => {
    if (navigating()) return
    onPreviewOpenChange(ticket.id, false)
  }
  const togglePreview = () => {
    if (!previewOpen) setPreviewMounted(true)
    onPreviewOpenChange(ticket.id, !previewOpen)
  }
  const pointAt = usePointedTicket(orgSlug, slug, ticket, patchRow, update)
  const key = selectionKey(slug, ticket.id)
  const { selection, sharedStatus, sharedPriority, acting, onPatch } =
    useRowSelection(key, pending, patchRow)
  return (
    <div
      className="group/list-row col-span-full grid grid-cols-subgrid"
      data-ticket-id={ticket.id}
      // Selected with others: its fields change them all (selectionKeys).
      data-row-selected={acting ? "" : undefined}
      {...pointAt}
    >
      <DeferredDropdownMenus>
        <Popover
          open={previewOpen}
          onOpenChange={(nextOpen, details) => {
            if (nextOpen && details.reason === "trigger-hover" && navigating())
              return
            if (nextOpen) setPreviewMounted(true)
            onPreviewOpenChange(ticket.id, nextOpen)
          }}
        >
          <TicketContextMenu
            ticket={ticket}
            members={members}
            onPatch={onPatch}
            remove={update.remove}
            mark={update.mark}
            fromList
          >
            <ListRow
              ref={rowElement}
              selected={selection?.selected}
              data-selection-key={selection ? key : undefined}
              variant={variant}
              disabled={!editable}
              link={
                <ItemLink
                  render={
                    <Link
                      to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                      params={{ orgSlug, slug, id: ticket.id }}
                      search={from ?? {}}
                      state={{ ticketTitle: ticket.title }}
                      preload="intent"
                    />
                  }
                  aria-label={
                    pending ? ticket.title : `${ticket.id} ${ticket.title}`
                  }
                  aria-haspopup="menu"
                  aria-keyshortcuts="Shift+F10 Space"
                  onKeyDown={(event) => {
                    if (event.key !== " " || hasModifier(event.nativeEvent))
                      return
                    event.preventDefault()
                    togglePreview()
                  }}
                />
              }
              lead={
                selection && (
                  <RowCheckbox ticketId={ticket.id} selection={selection} />
                )
              }
              status={
                <RowField name="status">
                  <StatusButton
                    ticket={ticket}
                    selected={sharedStatus}
                    stopPropagation
                    onPatch={onPatch}
                  />
                </RowField>
              }
              priority={
                <RowField name="priority">
                  <PriorityButton
                    ticket={ticket}
                    selected={sharedPriority}
                    stopPropagation
                    onPatch={onPatch}
                  />
                </RowField>
              }
              ticketKey={
                <TicketKey
                  value={ticket.id}
                  pending={pending}
                  className="min-w-(--ticket-key-width)"
                />
              }
              title={
                <RowTitle
                  shows={shows}
                  ticket={ticket}
                  contextParent={contextParent}
                  titleVariant={titleVariant}
                  onPointerEnter={handleTitlePointerEnter}
                  onPointerLeave={handleTitlePointerLeave}
                />
              }
              trailing={
                <RowTrailing
                  shows={shows}
                  ticket={ticket}
                  update={update}
                  editable={editable}
                  acting={acting}
                  showSprint={showSprint}
                  onPatch={onPatch}
                />
              }
              estimate={
                shows("estimate") &&
                estimateUnit !== null && (
                  <RowEstimate
                    unit={estimateUnit}
                    ticket={ticket}
                    mode={estimation}
                    onPatch={onPatch}
                  />
                )
              }
              assignee={
                shows("assignee") && (
                  <RowField name="assignee">
                    <AssigneeField
                      ticket={ticket}
                      members={members}
                      onPatch={onPatch}
                    />
                  </RowField>
                )
              }
            />
          </TicketContextMenu>
          {previewMounted && (
            <TicketHoverCard
              ticketId={ticket.id}
              scope={{ orgSlug, slug, members }}
              anchor={rowElement}
              interactive={false}
            />
          )}
        </Popover>
      </DeferredDropdownMenus>
    </div>
  )
}

type DisplayVisibility = Pick<ReturnType<typeof useDisplayProperties>, "shows">

function RowTitle({
  shows,
  ticket,
  contextParent,
  titleVariant,
  onPointerEnter,
  onPointerLeave
}: Pick<RowProps, "ticket" | "contextParent" | "titleVariant"> &
  DisplayVisibility &
  Readonly<{ onPointerEnter: () => void; onPointerLeave: () => void }>) {
  const { orgSlug, slug } = useProjectRoute()
  const from = use(TicketViewSourceContext)
  return (
    <>
      {ticket.parent &&
        ticket.parent.id !== contextParent &&
        (ticket.parent.type !== "epic" || shows("epic")) && (
          <ParentPrefix parent={ticket.parent} />
        )}
      <Link
        to="/orgs/$orgSlug/projects/$slug/tickets/$id"
        params={{ orgSlug, slug, id: ticket.id }}
        search={from ?? {}}
        state={{ ticketTitle: ticket.title }}
        preload="intent"
        draggable={false}
        tabIndex={-1}
        className="flex min-w-0 items-center self-stretch outline-none"
      >
        <PopoverTrigger
          openOnHover
          delay={TICKET_PREVIEW_DELAY_MS}
          nativeButton={false}
          onPointerEnter={onPointerEnter}
          onPointerLeave={onPointerLeave}
          render={({
            role: _role,
            tabIndex: _tabIndex,
            "aria-controls": _aria_controls,
            "aria-expanded": _aria_expanded,
            "aria-haspopup": _aria_haspopup,
            onClick: _onClick,
            onKeyDown: _onKeyDown,
            onKeyUp: _onKeyUp,
            onPointerDown: _onPointerDown,
            ...triggerProps
          }) => (
            <div
              {...triggerProps}
              className="relative z-20 flex min-w-0 flex-1 items-center self-stretch"
            />
          )}
        >
          <ListRowTitle variant={titleVariant}>{ticket.title}</ListRowTitle>
        </PopoverTrigger>
      </Link>
      <FlagChip ticket={ticket} className="ml-1" />
      <SubTicketsChip ticket={ticket} className="ml-1" />
    </>
  )
}

function RowCheckbox({
  ticketId,
  selection
}: Readonly<{
  ticketId: TicketId
  selection: NonNullable<ReturnType<typeof useTicketSelection>>
}>) {
  return (
    <Reveal>
      <Checkbox
        checked={selection.selected}
        onCheckedChange={(_checked, details) =>
          selection.toggle(withShift(details.event))
        }
        onMouseDown={(event) => {
          if (event.shiftKey) event.preventDefault()
        }}
        aria-label={m.tickets_row_select_aria_label({ id: ticketId })}
        variant="quiet"
        className="before:absolute before:-inset-y-4.25 before:-right-[11px] before:-left-[15px] before:content-['']"
      />
    </Reveal>
  )
}

const withShift = (event: Event) =>
  (event instanceof MouseEvent || event instanceof KeyboardEvent) &&
  event.shiftKey

function RowSprint({
  ticketId,
  placeholder
}: Readonly<{ ticketId: TicketId; placeholder?: string }>) {
  const { orgSlug, slug } = useProjectRoute()
  const membership = useAtomValue(
    sprintMembership(sprintListRequest(orgSlug, slug))
  )
  if (!Result.isSuccess(membership) || membership.value.size === 0) return null
  return (
    <SprintField
      variant="responsive"
      ticketId={ticketId}
      membership={membership.value.get(ticketId) ?? null}
      placeholder={placeholder}
    />
  )
}

// After a change the list refetches and hands every row a new ticket
// object, changed or not; a row renders again only when its ticket's
// contents did (Ticket is plain data, so JSON compares it), or any other
// prop changed.
const sameRowProps = (previous: RowProps, next: RowProps) => {
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
  return [...keys].every((key) =>
    key === "ticket"
      ? previous.ticket === next.ticket ||
        JSON.stringify(previous.ticket) === JSON.stringify(next.ticket)
      : Reflect.get(previous, key) === Reflect.get(next, key)
  )
}

export const Row = memo(RowImpl, sameRowProps)

// A row field the selection's keys (S, A, P, ⇧S, T) can open, and whose
// hover lights the same field on every selected row (selectionKeys).
function RowField({
  name,
  children
}: Readonly<{ name: string; children: ReactNode }>) {
  return (
    <span data-row-field={name} className="contents">
      {children}
    </span>
  )
}

function RowTrailing({
  shows,
  ticket,
  update,
  editable,
  acting,
  showSprint,
  onPatch
}: Pick<RowProps, "ticket" | "update"> &
  DisplayVisibility &
  Readonly<{
    editable: boolean
    acting: boolean
    showSprint: boolean
    onPatch: (edit: TicketEdit) => void
  }>) {
  return (
    <>
      <UpdateFailureMarker update={update.patch(ticket.id)} />
      {shows("tags") && (
        <span
          data-row-field="labels"
          className="flex items-center gap-1.5 *:max-w-32 empty:hidden"
        >
          <TagChips
            names={ticket.tags}
            onPatch={editable ? onPatch : undefined}
            placeholder={acting ? m.tickets_row_add_label() : undefined}
            max={3}
            collapse
          />
        </span>
      )}
      {shows("git") && (
        <fieldset disabled={!editable} className="contents">
          <BoardCardGit ticket={ticket} />
        </fieldset>
      )}
      <span className="flex items-center gap-1.5 empty:hidden">
        <RelationChips ticket={ticket} />
      </span>
      {showSprint && shows("sprint") && (
        <fieldset
          disabled={!editable}
          data-row-field="sprint"
          className="contents"
        >
          <RowSprint
            ticketId={ticket.id}
            placeholder={acting ? m.tickets_row_add_sprint() : undefined}
          />
        </fieldset>
      )}
    </>
  )
}

function useRowSelection(
  key: string,
  pending: RowProps["pending"],
  patchRow: (edit: TicketEdit) => void
) {
  const selectable = useTicketSelection(key)
  const selection = pending ? null : selectable
  const selectionActions = useSelectionActions(key)
  const shared =
    selectionActions.count > 1
      ? sharedTicketFields(selectionActions.selectedTickets)
      : null
  // Selected with others: the row shows every field (empty ones as a
  // placeholder) and its fields change them all.
  const acting = selection?.selected === true && selectionActions.count > 1
  const onPatch = (edit: TicketEdit) => {
    if (!selectionActions.patch(edit)) patchRow(edit)
  }
  return {
    selection,
    sharedStatus: shared === null ? undefined : (shared.status ?? null),
    sharedPriority: shared === null ? undefined : (shared.priority ?? null),
    acting,
    onPatch
  }
}
