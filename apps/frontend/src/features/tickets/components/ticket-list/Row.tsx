import { useAtomSet } from "@effect/atom-react"
import {
  estimationUnit,
  type Member,
  type ParentFilter,
  type Ticket
} from "@pp/shared"
import { buttonClassName } from "@pp/ui/button"
import { CheckboxIndicator } from "@pp/ui/checkbox"
import { ItemLink } from "@pp/ui/item-link"
import { cn } from "@pp/ui/lib/utils"
import { ListRow, ListRowTitle } from "@pp/ui/list-row"
import { Reveal } from "@pp/ui/reveal"
import { TicketKey } from "@pp/ui/ticket-key"
import { type ComponentProps, memo, use } from "react"

import { usePointedTicket } from "@/features/command-menu/hooks/usePointedTicket"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { BoardCardGit } from "@/features/sprints/components/BoardCardGit"
import { TagChips } from "@/features/sprints/components/BoardCardProperties"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import {
  FlagChip,
  RelationChipList,
  SubTicketsChip
} from "@/features/tickets/components/ticket-preview/PreviewChips"
import { TicketViewSourceContext } from "@/features/tickets/hooks/ticketViewSource"
import { useShownTicket } from "@/features/tickets/hooks/useShownTicket"
import {
  PRIORITY_LABELS,
  PRIORITY_META
} from "@/features/tickets/lib/priorityMeta"
import { ticketHref } from "@/features/tickets/lib/ticketHref"
import {
  statusLabelFor,
  statusMetaFor
} from "@/features/tickets/lib/ticketMeta"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { hotkeyKeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import { AssigneeRowButton } from "./AssigneeField"
import { RowEstimate } from "./EstimateField"
import { InListRow } from "./inListRow"
import { ParentPrefix } from "./ParentPrefix"
import { useRowSettings } from "./RowSettings"
import { RowSources } from "./rowSources"
import { SprintField } from "./SprintField"
import { StatusGlyph, statusFieldLabel } from "./StatusField"
import { useRowSelectionState } from "./TicketSelection"
import { UpdateFailureMarker } from "./UpdateFailureMarker"

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
}>

const fieldButtonClass = buttonClassName({
  variant: "ghost",
  tone: "strong",
  size: "square-6"
})

function RowImpl({
  update,
  variant = "standalone",
  titleVariant,
  ticket,
  members,
  contextParent,
  showSprint = true,
  pending = false,
  editable = true
}: RowProps) {
  const { orgSlug, slug, projectReq } = useProjectRoute()
  const { shows, estimation, statuses, membership } = useRowSettings()
  const search = use(TicketViewSourceContext)
  const sources = use(RowSources)
  useShownTicket(orgSlug, slug, pending ? null : ticket.id, search)
  const patchRow = useAtomSet(update.patch(ticket.id))
  const pointAt = usePointedTicket(orgSlug, slug, ticket, patchRow, update)
  const estimateUnit = estimationUnit(estimation)
  const key = selectionKey(slug, ticket.id)
  const { selectable, selected, acting } = useRowSelectionState(key)
  const href = ticketHref(orgSlug, slug, ticket.id, search)
  return (
    <div
      ref={(element) => {
        if (element !== null)
          sources?.set(element, {
            ticket,
            members,
            update,
            editable,
            key,
            project: projectReq,
            search
          })
      }}
      className="group/list-row col-span-full grid grid-cols-subgrid"
      data-ticket-id={ticket.id}
      // Selected with others: its fields change them all (selectionKeys).
      data-row-selected={acting ? "" : undefined}
      {...pointAt}
    >
      <InListRow value>
        <ListRow
          selected={selected}
          data-selection-key={selectable && !pending ? key : undefined}
          variant={variant}
          disabled={!editable}
          link={
            <ItemLink
              href={href}
              aria-label={
                pending ? ticket.title : `${ticket.id} ${ticket.title}`
              }
              aria-haspopup="menu"
              aria-keyshortcuts="Shift+F10 Space"
            />
          }
          lead={
            selectable &&
            !pending && (
              <Reveal>
                <CheckboxIndicator
                  variant="quiet"
                  checked={selected}
                  role="checkbox"
                  aria-checked={selected}
                  aria-hidden={undefined}
                  aria-label={m.tickets_row_select_aria_label({
                    id: ticket.id
                  })}
                  tabIndex={0}
                  data-row-select=""
                  data-slot="checkbox"
                  className="before:absolute before:-inset-y-4.25 before:-right-[11px] before:-left-[15px] before:content-['']"
                />
              </Reveal>
            )
          }
          status={<RowStatus status={ticket.status} statuses={statuses} />}
          priority={<RowPriority priority={ticket.priority} />}
          ticketKey={
            <TicketKey
              value={ticket.id}
              pending={pending}
              className="min-w-(--ticket-key-width)"
            />
          }
          title={
            <>
              {ticket.parent &&
                ticket.parent.id !== contextParent &&
                (ticket.parent.type !== "epic" || shows("epic")) && (
                  <ParentPrefix parent={ticket.parent} />
                )}
              <a
                href={href}
                data-row-title=""
                draggable={false}
                tabIndex={-1}
                className="flex min-w-0 items-center self-stretch outline-none"
              >
                <ListRowTitle variant={titleVariant}>
                  {ticket.title}
                </ListRowTitle>
              </a>
              <FlagChip ticket={ticket} className="ml-1" />
              <SubTicketsChip ticket={ticket} className="ml-1" />
            </>
          }
          trailing={
            <>
              <UpdateFailureMarker update={update.patch(ticket.id)} />
              {shows("tags") && (
                <span
                  data-row-field="labels"
                  className="flex items-center gap-1.5 *:max-w-32 empty:hidden"
                >
                  <TagChips
                    names={ticket.tags}
                    onPatch={editable ? patchRow : undefined}
                    placeholder={acting ? m.tickets_row_add_label() : undefined}
                    max={3}
                    collapse
                  />
                </span>
              )}
              {shows("git") && <BoardCardGit ticket={ticket} />}
              <span className="flex items-center gap-1.5 empty:hidden">
                <RelationChipList ticket={ticket} shows={shows} />
              </span>
              {showSprint &&
                shows("sprint") &&
                membership !== null &&
                membership.size > 0 && (
                  <SprintField
                    variant="responsive"
                    ticketId={ticket.id}
                    membership={membership.get(ticket.id) ?? null}
                    disabled={!editable}
                    placeholder={
                      acting ? m.tickets_row_add_sprint() : undefined
                    }
                  />
                )}
            </>
          }
          estimate={
            shows("estimate") &&
            estimateUnit !== null && (
              <RowEstimate
                unit={estimateUnit}
                ticket={ticket}
                mode={estimation}
                data-row-menu="estimate"
              />
            )
          }
          assignee={
            shows("assignee") && (
              <AssigneeRowButton
                assignees={ticket.assignees}
                members={members}
                data-row-field="assignee"
                data-row-menu="assignee"
              />
            )
          }
        />
      </InListRow>
    </div>
  )
}

function RowStatus({
  status,
  statuses
}: Readonly<{
  status: Ticket["status"]
  statuses: ReturnType<typeof useRowSettings>["statuses"]
}>) {
  const label = statusLabelFor(status, statuses)
  return (
    <button
      type="button"
      data-row-field="status"
      data-row-menu="status"
      aria-haspopup="menu"
      aria-label={statusFieldLabel(label, false)}
      data-tooltip={label}
      data-tooltip-keys={hotkeyKeys("tickets.status")}
      className={fieldButtonClass}
    >
      <StatusGlyph meta={statusMetaFor(status, statuses)} blocked={false} />
    </button>
  )
}

function RowPriority({ priority }: Readonly<{ priority: Ticket["priority"] }>) {
  const meta = PRIORITY_META[priority]
  const Icon = meta.icon
  const label = PRIORITY_LABELS[priority]()
  return (
    <button
      type="button"
      data-row-field="priority"
      data-row-menu="priority"
      aria-haspopup="menu"
      aria-label={m.tickets_priority_aria_label({ label })}
      data-tooltip={label}
      data-tooltip-keys={hotkeyKeys("tickets.priority")}
      className={fieldButtonClass}
    >
      <Icon className={cn("size-3.5", meta.className)} strokeWidth={1.75} />
    </button>
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
