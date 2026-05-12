import NumberFlow from "@number-flow/react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview"
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source"
import { STATUS_LABELS, STATUS_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import type {
  Member,
  Ticket,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { SprintBoardCard } from "./SprintBoardCard"
import type { CardDropData, ColumnDropData, DragData } from "./board-utils"

export function SprintBoardColumn({
  orgSlug,
  slug,
  status,
  tickets,
  members,
  isDraggable,
  overlay,
  lastFlash
}: {
  orgSlug: string
  slug: string
  status: TicketStatus
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
  isDraggable: boolean
  overlay: ReadonlyMap<TicketId, TicketStatus>
  lastFlash: { id: TicketId; tick: number } | null
}) {
  const [listRef] = useAutoAnimate({ duration: 180, easing: "ease-out" })
  const meta = STATUS_META[status]
  const Icon = meta.icon
  const columnRef = useRef<HTMLDivElement>(null)
  const [dragOver, setDragOver] = useState(false)
  useEffect(() => {
    if (!isDraggable) return
    const el = columnRef.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      getData: (): ColumnDropData => ({ type: "column", status })
    })
  }, [isDraggable, status])
  useEffect(() => {
    if (!isDraggable) return
    const update = ({
      location
    }: {
      location: { current: { dropTargets: ReadonlyArray<{ element: Element }> } }
    }) => {
      const el = columnRef.current
      const inner = location.current.dropTargets[0]?.element
      setDragOver(el != null && inner != null && el.contains(inner))
    }
    return monitorForElements({
      onDragStart: update,
      onDrag: update,
      onDrop: () => setDragOver(false)
    })
  }, [isDraggable])
  return (
    <div
      ref={columnRef}
      className="flex max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background"
    >
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <span className="inline-flex items-center gap-2 text-sm font-medium">
          <Icon className={cn("size-4", meta.className)} strokeWidth={1.75} />
          {STATUS_LABELS[status]()}
        </span>
        <NumberFlow
          value={tickets.length}
          transformTiming={{ duration: 180, easing: "ease-out" }}
          spinTiming={{ duration: 180, easing: "ease-out" }}
          opacityTiming={{ duration: 180, easing: "ease-out" }}
          className="font-mono text-xs text-muted-foreground tabular-nums"
        />
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-2 inset-y-3 z-0 rounded-md border border-dashed border-transparent transition-colors duration-150",
            dragOver && "border-border bg-accent/40"
          )}
        />
        <div
          ref={listRef}
          className="relative z-10 flex min-h-0 flex-col overflow-y-auto py-2"
        >
          {tickets.map((t) => (
            <CardSlot
              key={t.id}
              orgSlug={orgSlug}
              slug={slug}
              ticket={t}
              status={status}
              members={members}
              isDraggable={isDraggable}
              pending={overlay.has(t.id)}
              flashKey={lastFlash?.id === t.id ? lastFlash.tick : undefined}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function CardSlot({
  orgSlug,
  slug,
  ticket,
  status,
  members,
  isDraggable,
  pending,
  flashKey
}: {
  orgSlug: string
  slug: string
  ticket: Ticket
  status: TicketStatus
  members: ReadonlyArray<Member>
  isDraggable: boolean
  pending: boolean
  flashKey: number | undefined
}) {
  const ticketId = ticket.id
  const ref = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null)

  useEffect(() => {
    if (!isDraggable) return
    const el = ref.current
    const card = cardRef.current
    if (!el || !card) return
    const cleanupDrag = draggable({
      element: card,
      getInitialData: (): DragData => ({
        type: "card",
        id: ticketId,
        status
      }),
      onGenerateDragPreview: ({ location, nativeSetDragImage }) => {
        setCustomNativeDragPreview({
          nativeSetDragImage,
          getOffset: preserveOffsetOnSource({
            element: card,
            input: location.current.input
          }),
          render: ({ container }) => {
            const rect = card.getBoundingClientRect()
            const clone = card.cloneNode(true) as HTMLElement
            clone.style.width = `${rect.width}px`
            clone.style.height = `${rect.height}px`
            container.appendChild(clone)
          }
        })
      },
      onDragStart: () => setDragging(true),
      onDrop: () => setDragging(false)
    })
    const cleanupDrop = dropTargetForElements({
      element: el,
      getData: ({ input, element }): CardDropData => {
        const rect = element.getBoundingClientRect()
        const e: "top" | "bottom" =
          input.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
        return { type: "card", id: ticketId, status, edge: e }
      },
      onDragEnter: ({ self, source }) => {
        const data = source.data as unknown as DragData
        if (data.id === ticketId) return
        setEdge((self.data as unknown as CardDropData).edge)
      },
      onDrag: ({ self, source }) => {
        const data = source.data as unknown as DragData
        if (data.id === ticketId) return
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
  }, [ticketId, status, isDraggable])

  return (
    <div ref={ref} className="relative px-2 py-1">
      <div
        ref={cardRef}
        className={cn(
          "rounded-md",
          dragging && "opacity-40",
          pending && "animate-pulse"
        )}
      >
        <motion.div
          key={flashKey ?? 0}
          initial={
            flashKey ? { boxShadow: "0 0 0 3px var(--foreground)" } : false
          }
          animate={{ boxShadow: "0 0 0 0px transparent" }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="rounded-md"
        >
          <SprintBoardCard
            orgSlug={orgSlug}
            slug={slug}
            ticket={ticket}
            members={members}
          />
        </motion.div>
      </div>
      {edge && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-3 z-10 h-0.5 rounded-full bg-foreground/70",
            edge === "top"
              ? "top-0 -translate-y-1/2"
              : "bottom-0 translate-y-1/2"
          )}
        />
      )}
    </div>
  )
}

