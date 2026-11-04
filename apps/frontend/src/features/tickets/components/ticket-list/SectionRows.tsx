import { useAtomValue } from "@effect/atom-react"
import { hasSubTickets, type Member, type TicketId } from "@pp/shared"
import { useRef, type MouseEvent } from "react"

import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTicketUpdates,
  childTicketsRequest,
  expandedChildTickets,
  expandedChildrenRequest
} from "@/features/tickets/atoms/childTickets"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import {
  expandedParents,
  withExpandedChildren,
  type NestedEntry
} from "@/features/tickets/lib/nestedRows"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { useFluidHover } from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { NestTree, type RowNest } from "./NestTree"
import { Row, rowGridClassName } from "./Row"
import { useSubTicketExpansion } from "./SubTicketExpansion"
import { VirtualRows } from "./VirtualRows"

export function SectionRows({
  items,
  update,
  members,
  editable,
  showParent,
  showSprint,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: Readonly<{
  items: ReadonlyArray<TicketRow>
  update: TicketUpdates
  members: ReadonlyArray<Member>
  editable: boolean
  showParent: boolean
  showSprint: boolean
  activePreviewId: TicketId | null
  onPreviewPointerEnter: (ticketId: TicketId) => void
  onPreviewOpenChange: (ticketId: TicketId, open: boolean) => void
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  const expansion = useSubTicketExpansion()
  const expanded =
    expansion === null
      ? new Set<TicketId>()
      : expandedParents(items, expansion.isExpanded)
  const children = useAtomValue(
    expandedChildTickets(expandedChildrenRequest(orgSlug, slug, expanded))
  )
  const entries = withExpandedChildren(items, expanded, (parent) =>
    children.get(parent)
  )

  const nestOf = (entry: NestedEntry): RowNest | undefined => {
    if (entry.kind === "children") return { role: "child", last: true }
    if (entry.parent !== null) return { role: "child", last: entry.last }
    const { ticket } = entry.row
    if (expansion === null || !hasSubTickets(ticket)) return undefined
    return {
      role: "parent",
      expanded: expanded.has(ticket.id),
      onToggle: () => expansion.toggle(ticket.id)
    }
  }
  const updatesFor = (entry: NestedEntry) =>
    entry.parent === null
      ? update
      : childTicketUpdates(childTicketsRequest(orgSlug, slug, entry.parent))

  // Fluid hover: one sliding pill that tracks the row nearest the pointer.
  // Gaps between rows are covered by each row's link, so the hook's
  // click-the-nearest-item handler isn't wired. Menus and previews opened
  // from a row are portaled, but React still bubbles their mouse events here;
  // those clear the pill instead of moving it to the row under the popup.
  // While a row has a popup open the pill hides and that row's own tint shows.
  const onMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    if (
      event.target instanceof Node &&
      event.currentTarget.contains(event.target)
    )
      hover.handlers.onMouseMove(event)
    else hover.handlers.onMouseLeave()
  }
  return (
    <div
      ref={listRef}
      role="presentation"
      onMouseEnter={hover.handlers.onMouseEnter}
      onMouseMove={onMouseMove}
      onMouseLeave={hover.handlers.onMouseLeave}
      className="relative has-[[data-popup-open]]:[&>[data-slot=fluid-hover-highlight]]:invisible"
    >
      <FluidHoverHighlight hover={hover} className="rounded-lg" />
      <VirtualRows
        className={rowGridClassName}
        rowKeys={entries.map(({ key }) => key)}
        activeIndex={entries.findIndex(
          (entry) =>
            entry.kind === "row" && entry.row.ticket.id === activePreviewId
        )}
      >
        {(index) => {
          const entry = entries[index]
          const nest = nestOf(entry)
          if (entry.kind === "children") {
            return (
              <div
                className={cn(
                  "relative isolate col-span-full grid grid-cols-subgrid items-center gap-x-1.5 rounded-lg px-3 py-2.5"
                )}
              >
                <NestTree nest={nest} />
                <span
                  className={cn(
                    "col-start-1 mx-auto size-3.5 rounded-full border border-dashed border-border",
                    entry.state === "loading" && "animate-pulse"
                  )}
                />
                <span
                  className={cn(
                    "col-start-4 pl-1.5 text-sm text-muted-foreground",
                    entry.state === "loading" && "animate-pulse"
                  )}
                >
                  {entry.state === "loading"
                    ? m.tickets_sub_tickets_loading()
                    : m.tickets_sub_tickets_load_failed()}
                </span>
              </div>
            )
          }
          const { ticket, pending } = entry.row
          return (
            <div
              inert={pending}
              aria-busy={pending}
              className={cn(
                "col-span-full grid grid-cols-subgrid",
                pending && "pointer-events-none animate-pulse"
              )}
            >
              <Row
                update={updatesFor(entry)}
                nest={nest}
                showParent={showParent}
                showSprint={showSprint}
                ticket={ticket}
                members={members}
                pending={pending}
                editable={editable}
                previewOpen={activePreviewId === ticket.id}
                onPreviewPointerEnter={onPreviewPointerEnter}
                onPreviewOpenChange={onPreviewOpenChange}
                hoverIndex={index}
                registerHover={hover.registerItem}
              />
            </div>
          )
        }}
      </VirtualRows>
    </div>
  )
}
