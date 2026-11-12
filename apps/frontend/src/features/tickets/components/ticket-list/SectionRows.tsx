import type { Member, ParentFilter, TicketId } from "@pp/shared"
import { useRef, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type {
  BulkTicketUpdateAtom,
  TicketUpdates
} from "@/features/tickets/atoms/ticketRows"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { cn } from "@/lib/utils"

import { useListKeyboardSection } from "./ListKeyboard"
import { Row, rowGridClassName } from "./Row"
import { SelectionOrder } from "./TicketSelection"
import { VirtualRows } from "./VirtualRows"

export function SectionRows({
  items,
  update,
  bulkUpdate,
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
  bulkUpdate: BulkTicketUpdateAtom
  members: ReadonlyArray<Member>
  editable: boolean
  contextParent: ParentFilter | undefined
  showSprint: boolean
  activePreviewId: TicketId | null
  onPreviewPointerEnter: (ticketId: TicketId) => void
  onPreviewOpenChange: (ticketId: TicketId, open: boolean) => void
}>) {
  const { slug } = useProjectRoute()
  const section = useRef<HTMLDivElement>(null)
  const [reveal, setReveal] = useState<Readonly<{ index: number }> | null>(null)
  useListKeyboardSection(
    section,
    items.flatMap(({ ticket, pending }) => (pending ? [] : [ticket.id])),
    (ticketId) =>
      setReveal({
        index: items.findIndex(({ ticket }) => ticket.id === ticketId)
      })
  )
  return (
    <SelectionOrder
      entries={items.flatMap(({ ticket, pending }) =>
        pending
          ? []
          : [{ key: selectionKey(slug, ticket.id), ticket, bulk: bulkUpdate }]
      )}
    >
      <div ref={section} className="contents">
        <VirtualRows
          className={rowGridClassName}
          rowKeys={items.map(({ key }) => key)}
          activeIndex={items.findIndex(
            ({ ticket }) => ticket.id === activePreviewId
          )}
          reveal={reveal}
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
      </div>
    </SelectionOrder>
  )
}
