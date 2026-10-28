import { useAtomValue } from "@effect/atom-react"
import type { Member, TicketId } from "@pp/shared"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  childTicketUpdates,
  childTicketsRequest,
  expandedChildTickets,
  expandedChildrenRequest
} from "@/features/tickets/atoms/childTickets"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import {
  withExpandedChildren,
  type NestedEntry
} from "@/features/tickets/lib/nestedRows"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { NestTree, type RowNest } from "./NestTree"
import { Row, rowGridClassName } from "./Row"
import { useSubTicketExpansion } from "./SubTicketExpansion"
import { VirtualRows } from "./VirtualRows"

const hasChildren = (row: TicketRow) => (row.ticket.subTicketCount ?? 0) > 0

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
  const expansion = useSubTicketExpansion()
  const expanded = new Set(
    expansion === null
      ? []
      : items
          .filter(
            (row) => hasChildren(row) && expansion.isExpanded(row.ticket.id)
          )
          .map((row) => row.ticket.id)
  )
  const children = useAtomValue(
    expandedChildTickets(expandedChildrenRequest(orgSlug, slug, expanded))
  )
  const entries = withExpandedChildren(items, expanded, (parent) =>
    children.get(parent)
  )

  const nestOf = (index: number): RowNest | undefined => {
    const entry = entries[index]
    if (entry.parent === null) {
      if (
        entry.kind !== "row" ||
        !hasChildren(entry.row) ||
        expansion === null
      ) {
        return undefined
      }
      const id = entry.row.ticket.id
      return {
        role: "parent",
        expanded: expanded.has(id),
        onToggle: () => expansion.toggle(id)
      }
    }
    return {
      role: "child",
      last: entries[index + 1]?.parent !== entry.parent
    }
  }
  const updatesFor = (entry: NestedEntry) =>
    entry.parent === null
      ? update
      : childTicketUpdates(childTicketsRequest(orgSlug, slug, entry.parent))

  return (
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
        const nest = nestOf(index)
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
            />
          </div>
        )
      }}
    </VirtualRows>
  )
}
