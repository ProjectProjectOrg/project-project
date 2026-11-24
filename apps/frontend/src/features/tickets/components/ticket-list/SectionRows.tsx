import { useAtomValue, useAtomSet } from "@effect/atom-react"
import type { Member, ParentFilter, TicketId } from "@pp/shared"
import { cn } from "@pp/ui/lib/utils"
import { listGridClassName } from "@pp/ui/list-row"
import { useCallback, useMemo, useRef, useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { justCreatedTicket } from "@/features/tickets/atoms/createTicket"
import type {
  BulkTicketUpdateAtom,
  TicketUpdates
} from "@/features/tickets/atoms/ticketRows"
import { isFresh } from "@/features/tickets/lib/createdRow"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"

import { CreatedFlash, RowEnter } from "./CreatedRow"
import { useListKeyboardSection } from "./ListKeyboard"
import {
  DraggableRow,
  SectionDropProvider,
  type SectionDrop
} from "./ListRowDrag"
import { Row } from "./Row"
import { SelectionOrder } from "./TicketSelection"
import { VirtualRows } from "./VirtualRows"

export function SectionRows({
  items,
  drop,
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
  drop: SectionDrop | null
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
  const created = useAtomValue(justCreatedTicket)
  const setCreated = useAtomSet(justCreatedTicket)
  const createdIndex =
    created === null
      ? -1
      : items.findIndex(
          ({ ticket, pending }) => !pending && ticket.id === created.id
        )
  const scrollTo = useMemo(
    () =>
      created !== null && createdIndex >= 0 && isFresh(created.at)
        ? { index: createdIndex }
        : null,
    [created, createdIndex]
  )
  const clearCreated = useCallback(() => setCreated(null), [setCreated])
  return (
    <SelectionOrder
      entries={items.flatMap(({ ticket, pending }) =>
        pending
          ? []
          : [
              {
                key: selectionKey(slug, ticket.id),
                ticket,
                bulk: bulkUpdate,
                remove: update.remove
              }
            ]
      )}
    >
      <SectionDropProvider drop={drop}>
        <div ref={section} className="contents">
          <VirtualRows
            className={listGridClassName}
            rowKeys={items.map(({ key }) => key)}
            activeIndex={items.findIndex(
              ({ ticket }) => ticket.id === activePreviewId
            )}
            reveal={reveal}
            scrollTo={scrollTo}
          >
            {(index) => {
              const { ticket, pending } = items[index]
              const justCreated = !pending && created?.id === ticket.id
              return (
                <RowEnter
                  enter={pending || (justCreated && isFresh(created.at))}
                  className="col-span-full grid grid-cols-subgrid"
                >
                  {justCreated && (
                    <CreatedFlash at={created.at} onDone={clearCreated} />
                  )}
                  <div
                    inert={pending}
                    aria-busy={pending}
                    className={cn(
                      "col-span-full grid grid-cols-subgrid",
                      pending && "pointer-events-none"
                    )}
                  >
                    <DraggableRow
                      ticket={ticket}
                      nextId={items[index + 1]?.ticket.id ?? null}
                      pending={pending}
                      className="col-span-full grid grid-cols-subgrid"
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
                    </DraggableRow>
                  </div>
                </RowEnter>
              )
            }}
          </VirtualRows>
        </div>
      </SectionDropProvider>
    </SelectionOrder>
  )
}
