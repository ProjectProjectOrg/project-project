import type { Member, ParentFilter, TicketId } from "@pp/shared"

import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { cn } from "@/lib/utils"

import { Row, rowGridClassName } from "./Row"
import { VirtualRows } from "./VirtualRows"

export function SectionRows({
  items,
  update,
  members,
  editable,
  contextParent,
  showSprint,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: Readonly<{
  items: ReadonlyArray<TicketRow>
  update: TicketUpdates
  members: ReadonlyArray<Member>
  editable: boolean
  contextParent: ParentFilter | undefined
  showSprint: boolean
  activePreviewId: TicketId | null
  onPreviewPointerEnter: (ticketId: TicketId) => void
  onPreviewOpenChange: (ticketId: TicketId, open: boolean) => void
}>) {
  return (
    <VirtualRows
      className={rowGridClassName}
      rowKeys={items.map(({ key }) => key)}
      activeIndex={items.findIndex(
        ({ ticket }) => ticket.id === activePreviewId
      )}
    >
      {(index) => {
        const { ticket, pending } = items[index]
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
              update={update}
              contextParent={contextParent}
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
