import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { Member, ParentFilter, Ticket, TicketId } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"
import { AnimatePresence, motion } from "motion/react"
import { memo, use, useRef, useState } from "react"

import { Checkbox } from "@/components/ui/checkbox"
import { DeferredDropdownMenus } from "@/components/ui/dropdown-menu"
import { Popover, PopoverTrigger } from "@/components/ui/popover"
import { usePointedTicket } from "@/features/command-menu/hooks/usePointedTicket"
import { TicketGitChip } from "@/features/github/components/ticket-git/TicketGit"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  relationChipClass,
  TagChips
} from "@/features/sprints/components/BoardCardProperties"
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
import type { TicketEdit } from "@/features/tickets/lib/ticketPatch"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { AssigneeField } from "./AssigneeField"
import { EstimateChip } from "./EstimateField"
import { ParentPrefix } from "./ParentPrefix"
import { PriorityButton } from "./PriorityField"
import { SprintField } from "./SprintField"
import { StatusButton } from "./StatusField"
import { useSelectionActions, useTicketSelection } from "./TicketSelection"
import { UpdateFailureMarker } from "./UpdateFailureMarker"

const TICKET_PREVIEW_DELAY_MS = 550

export const rowGridClassName =
  "grid gap-y-1 grid-cols-[auto_auto_auto_auto_minmax(0,1fr)_auto]"

export type RowProps = Readonly<{
  update: TicketUpdates
  variant?: "standalone" | "embedded"
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
  const patchRow = useAtomSet(update(ticket.id))
  const dashIdx = ticket.id.lastIndexOf("-")
  const idPrefix = dashIdx >= 0 ? ticket.id.slice(0, dashIdx) : ticket.id
  const idTail = dashIdx >= 0 ? ticket.id.slice(dashIdx + 1) : ""
  const rowElement = useRef<HTMLDivElement>(null)
  const estimation = useEstimationMode()
  const { shows } = useDisplayProperties()
  const [previewMounted, setPreviewMounted] = useState(false)
  const handleTitlePointerEnter = () => {
    onPreviewPointerEnter(ticket.id)
  }
  const handleTitlePointerLeave = () => {
    onPreviewOpenChange(ticket.id, false)
  }
  const pointAt = usePointedTicket(orgSlug, slug, ticket.id)
  const key = selectionKey(slug, ticket.id)
  const selectable = useTicketSelection(key)
  const selection = pending ? null : selectable
  const selectionActions = useSelectionActions(key)
  const onPatch = (edit: TicketEdit) => {
    if (!selectionActions.patch(edit)) patchRow(edit)
  }
  return (
    <div
      className="group/list-row col-span-full grid grid-cols-subgrid"
      {...pointAt}
    >
      <DeferredDropdownMenus>
        <Popover
          open={previewOpen}
          onOpenChange={(nextOpen) => {
            if (nextOpen) setPreviewMounted(true)
            onPreviewOpenChange(ticket.id, nextOpen)
          }}
        >
          <TicketContextMenu
            ticket={ticket}
            members={members}
            onPatch={onPatch}
            fromList
          >
            <div
              ref={rowElement}
              data-selected={selection?.selected || undefined}
              data-selection-key={selection ? key : undefined}
              className={cn(
                "group/reveal relative col-span-full grid grid-cols-subgrid items-center gap-x-(--list-row-gap) px-3 py-2.5 text-left outline-none [&_a:not([data-row-link])]:relative [&_a:not([data-row-link])]:z-20 [&_button]:relative [&_button]:z-20",
                variant === "standalone" &&
                  "isolate rounded-lg transition-colors hover:bg-hover not-data-selected:has-[[data-popup-open]]:bg-hover data-selected:bg-foreground/6 not-data-selected:data-[popup-open]:bg-hover"
              )}
            >
              <Link
                to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                params={{ orgSlug, slug, id: ticket.id }}
                search={from ?? {}}
                preload="intent"
                data-row-link
                aria-label={`${ticket.id} ${ticket.title}`}
                aria-haspopup="menu"
                aria-keyshortcuts="Shift+F10"
                className="absolute inset-0 z-10 rounded-lg outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"
              />
              <span className="relative z-20 box-content flex w-(--list-lead) justify-center pr-[calc(var(--list-lead-gap)-var(--list-row-gap))]">
                {selection && (
                  <RowCheckbox ticketId={ticket.id} selection={selection} />
                )}
              </span>
              <fieldset disabled={!editable} className="contents">
                <span className="relative z-20 flex w-(--list-icon) justify-center">
                  <StatusButton
                    ticket={ticket}
                    stopPropagation
                    onPatch={onPatch}
                  />
                </span>
                <span className="relative z-20 inline-flex">
                  <PriorityButton
                    ticket={ticket}
                    stopPropagation
                    onPatch={onPatch}
                  />
                </span>
                <span className="shrink-0 text-body">
                  <span className="inline-flex min-w-(--ticket-key-width) items-baseline font-mono text-caption text-muted-foreground tabular-nums">
                    <span>{idPrefix}-</span>
                    <AnimatePresence initial={false} mode="popLayout">
                      {!pending && (
                        <motion.span
                          key={idTail}
                          initial={{ opacity: 0, filter: "blur(4px)" }}
                          animate={{ opacity: 1, filter: "blur(0px)" }}
                          exit={{ opacity: 0, filter: "blur(4px)" }}
                          transition={transitions.presence}
                          className="inline-block"
                        >
                          {idTail}
                        </motion.span>
                      )}
                    </AnimatePresence>
                  </span>
                </span>
              </fieldset>
              <div className="col-start-5 row-start-1 flex min-w-0 items-center self-stretch pl-1">
                {ticket.parent &&
                  ticket.parent.id !== contextParent &&
                  (ticket.parent.type !== "epic" || shows("epic")) && (
                    <ParentPrefix parent={ticket.parent} />
                  )}
                <Link
                  to="/orgs/$orgSlug/projects/$slug/tickets/$id"
                  params={{ orgSlug, slug, id: ticket.id }}
                  search={from ?? {}}
                  preload="intent"
                  tabIndex={-1}
                  className="flex min-w-0 items-center self-stretch outline-none"
                >
                  <PopoverTrigger
                    openOnHover
                    delay={TICKET_PREVIEW_DELAY_MS}
                    nativeButton={false}
                    onPointerEnter={handleTitlePointerEnter}
                    onPointerLeave={handleTitlePointerLeave}
                    render={(triggerProps) => (
                      <div
                        {...triggerProps}
                        role={undefined}
                        tabIndex={undefined}
                        aria-controls={undefined}
                        aria-expanded={undefined}
                        aria-haspopup={undefined}
                        onClick={undefined}
                        onKeyDown={undefined}
                        onKeyUp={undefined}
                        onPointerDown={undefined}
                        className="relative z-20 flex min-w-0 flex-1 items-center self-stretch"
                      />
                    )}
                  >
                    <span className="min-w-0 truncate text-body font-semibold">
                      {ticket.title}
                    </span>
                  </PopoverTrigger>
                </Link>
                <FlagChip ticket={ticket} className="ml-1" />
                <SubTicketsChip ticket={ticket} className="ml-1" />
              </div>
              <div className="flex shrink-0 items-center justify-end gap-1 [&>fieldset>span:empty]:hidden">
                <UpdateFailureMarker update={update(ticket.id)} />
                {shows("tags") && (
                  <span className="flex items-center gap-1.5 *:max-w-32 empty:hidden">
                    <TagChips
                      names={ticket.tags}
                      onPatch={editable ? onPatch : undefined}
                      max={3}
                    />
                  </span>
                )}
                {shows("git") && (
                  <fieldset disabled={!editable} className="contents">
                    <TicketGitChip
                      orgSlug={orgSlug}
                      slug={slug}
                      ticket={ticket}
                    />
                  </fieldset>
                )}
                <span className="flex items-center gap-1.5 empty:hidden">
                  <RelationChips
                    ticket={ticket}
                    className={relationChipClass}
                  />
                </span>
                <fieldset disabled={!editable} className="contents">
                  {shows("estimate") && (
                    <EstimateChip ticket={ticket} mode={estimation} />
                  )}
                  {showSprint && shows("sprint") && (
                    <RowSprint ticketId={ticket.id} />
                  )}
                  {shows("assignee") && (
                    <AssigneeField
                      ticket={ticket}
                      members={members}
                      onPatch={onPatch}
                      className="hidden sm:inline-flex"
                    />
                  )}
                </fieldset>
              </div>
            </div>
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

function RowCheckbox({
  ticketId,
  selection
}: Readonly<{
  ticketId: TicketId
  selection: NonNullable<ReturnType<typeof useTicketSelection>>
}>) {
  return (
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
      className="opacity-0 transition-opacity group-hover/reveal:opacity-100 group-has-[:focus-visible]/reveal:opacity-100 group-has-[[data-popup-open]]/reveal:opacity-100 group-data-[popup-open]/reveal:opacity-100 before:absolute before:-inset-y-[17px] before:-right-[11px] before:-left-[15px] before:content-[''] data-checked:opacity-100"
    />
  )
}

const withShift = (event: Event) =>
  (event instanceof MouseEvent || event instanceof KeyboardEvent) &&
  event.shiftKey

function RowSprint({ ticketId }: Readonly<{ ticketId: TicketId }>) {
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
    />
  )
}

export const Row = memo(RowImpl)
