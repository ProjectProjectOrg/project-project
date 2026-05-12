import NumberFlow from "@number-flow/react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import { motion } from "motion/react"
import { useEffect, useRef, useState } from "react"
import {
  draggable,
  dropTargetForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { STATUS_LABELS, STATUS_META } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import type {
  Member,
  Ticket,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { SprintBoardCard } from "./SprintBoardCard"
import type { CardDropData, ColumnDropData, DragData } from "./-board-utils"

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
  return (
    <div className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-border bg-background">
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
      <div ref={listRef} className="flex flex-1 flex-col overflow-y-auto py-2">
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
        <ColumnTail
          status={status}
          hasCards={tickets.length > 0}
          enabled={isDraggable}
        />
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
  const [dragging, setDragging] = useState(false)
  const [edge, setEdge] = useState<"top" | "bottom" | null>(null)

  useEffect(() => {
    if (!isDraggable) return
    const el = ref.current
    if (!el) return
    const cleanupDrag = draggable({
      element: el,
      getInitialData: (): DragData => ({
        type: "card",
        id: ticketId,
        status
      }),
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
      <motion.div
        key={flashKey ?? 0}
        initial={
          flashKey ? { boxShadow: "0 0 0 3px var(--foreground)" } : false
        }
        animate={{ boxShadow: "0 0 0 0px transparent" }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={cn(
          "rounded-md",
          dragging && "opacity-40",
          pending && "animate-pulse"
        )}
      >
        <SprintBoardCard
          orgSlug={orgSlug}
          slug={slug}
          ticket={ticket}
          members={members}
        />
      </motion.div>
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

function ColumnTail({
  status,
  hasCards,
  enabled
}: {
  status: TicketStatus
  hasCards: boolean
  enabled: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [over, setOver] = useState(false)
  useEffect(() => {
    if (!enabled) return
    const el = ref.current
    if (!el) return
    return dropTargetForElements({
      element: el,
      getData: (): ColumnDropData => ({ type: "column", status }),
      onDragEnter: () => setOver(true),
      onDragLeave: () => setOver(false),
      onDrop: () => setOver(false)
    })
  }, [status, enabled])
  return (
    <div ref={ref} className="relative flex-1 min-h-4 px-2">
      {over && hasCards && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-3 top-0 z-10 h-0.5 -translate-y-1/2 rounded-full bg-foreground/70"
        />
      )}
    </div>
  )
}
