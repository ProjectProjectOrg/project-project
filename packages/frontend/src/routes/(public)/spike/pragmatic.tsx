import { createFileRoute } from "@tanstack/react-router"
import { useEffect, useRef, useState } from "react"
import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import {
  BOARD_FRAME_CLASS,
  COLUMN_FRAME_CLASS,
  COLUMN_HEADER_CLASS,
  COLUMN_LIST_CLASS,
  generateTickets,
  groupByStatus,
  PerfOverlay,
  SPIKE_STATUSES,
  STATUS_LABEL,
  SpikeCard,
  type SpikeStatus,
  type SpikeTicket,
  useFlashOnLand
} from "./-shared"

export const Route = createFileRoute("/(public)/spike/pragmatic")({
  component: PragmaticBoard
})

type DragData = { type: "card"; id: string }
type CardDropData = {
  type: "card"
  id: string
  status: SpikeStatus
  edge: "top" | "bottom"
}
type ColumnDropData = { type: "column"; status: SpikeStatus }
type DropData = CardDropData | ColumnDropData

function PragmaticBoard() {
  const [cardCount, setCardCount] = useState(200)
  const [tickets, setTickets] = useState<SpikeTicket[]>(() =>
    generateTickets(200)
  )
  const { flash, flashKey } = useFlashOnLand()

  useEffect(() => {
    setTickets(generateTickets(cardCount))
  }, [cardCount])

  useEffect(() => {
    return monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data as unknown as DragData
        const dst = target.data as unknown as DropData
        if (src.type !== "card") return
        if (dst.type === "card" && dst.id === src.id) return

        setTickets((prev) => {
          const next = prev.slice()
          const srcIdx = next.findIndex((t) => t.id === src.id)
          if (srcIdx === -1) return prev
          const [moved] = next.splice(srcIdx, 1)

          if (dst.type === "column") {
            moved.status = dst.status
            next.push(moved)
          } else {
            const dstIdx = next.findIndex((t) => t.id === dst.id)
            const insertAt = dst.edge === "bottom" ? dstIdx + 1 : dstIdx
            moved.status = dst.status
            next.splice(insertAt, 0, moved)
          }

          for (const s of SPIKE_STATUSES) {
            let p = 0
            for (const t of next) if (t.status === s) t.position = p++
          }
          return next
        })
        flash(src.id)
      }
    })
  }, [flash])

  const grouped = groupByStatus(tickets)

  return (
    <>
      <div className={BOARD_FRAME_CLASS}>
        {SPIKE_STATUSES.map((status) => (
          <Column
            key={status}
            status={status}
            tickets={grouped[status]}
            flashKey={flashKey}
          />
        ))}
      </div>
      <PerfOverlay cardCount={cardCount} setCardCount={setCardCount} />
    </>
  )
}

function Column({
  status,
  tickets,
  flashKey
}: {
  status: SpikeStatus
  tickets: SpikeTicket[]
  flashKey: (id: string) => number | undefined
}) {
  const [listRef] = useAutoAnimate({ duration: 180, easing: "ease-out" })

  return (
    <div className={COLUMN_FRAME_CLASS}>
      <div className={COLUMN_HEADER_CLASS}>
        <span>{STATUS_LABEL[status]}</span>
        <span className="text-muted-foreground/70">{tickets.length}</span>
      </div>
      <div ref={listRef} className={COLUMN_LIST_CLASS}>
        {tickets.map((t) => (
          <DraggableCard key={t.id} ticket={t} flashKey={flashKey(t.id)} />
        ))}
        <ColumnTail status={status} hasCards={tickets.length > 0} />
      </div>
    </div>
  )
}

function ColumnTail({
  status,
  hasCards
}: {
  status: SpikeStatus
  hasCards: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isOver, setIsOver] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      getData: (): ColumnDropData => ({ type: "column", status }),
      onDragEnter: () => setIsOver(true),
      onDragLeave: () => setIsOver(false),
      onDrop: () => setIsOver(false)
    })
  }, [status])

  return (
    <div ref={ref} className="relative flex-1 min-h-4 px-2">
      {isOver && hasCards && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground"
        />
      )}
    </div>
  )
}

function DraggableCard({
  ticket,
  flashKey
}: {
  ticket: SpikeTicket
  flashKey?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const cleanupDrag = draggable({
      element: el,
      getInitialData: (): DragData => ({ type: "card", id: ticket.id }),
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false)
    })
    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: ({ input, element }): CardDropData => {
        const rect = element.getBoundingClientRect()
        const e: "top" | "bottom" =
          input.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
        return { type: "card", id: ticket.id, status: ticket.status, edge: e }
      },
      onDragEnter: ({ self, source }) => {
        if ((source.data as unknown as DragData).id === ticket.id) return
        setEdge((self.data as unknown as CardDropData).edge)
      },
      onDrag: ({ self, source }) => {
        if ((source.data as unknown as DragData).id === ticket.id) return
        const next = (self.data as unknown as CardDropData).edge
        setEdge((prev) => (prev === next ? prev : next))
      },
      onDragLeave: () => setEdge(null),
      onDrop: () => setEdge(null)
    })
    return () => {
      cleanupDrag()
      cleanupDrop()
    }
  }, [ticket.id, ticket.status])

  return (
    <div ref={ref} className="relative px-2 py-1">
      <SpikeCard ticket={ticket} dragging={dragging} flashKey={flashKey} />
      {edge && (
        <div
          aria-hidden
          className={`pointer-events-none absolute inset-x-3 z-10 h-0.5 rounded-full bg-foreground ${
            edge === "top" ? "top-0 -translate-y-1/2" : "bottom-0 translate-y-1/2"
          }`}
        />
      )}
    </div>
  )
}
