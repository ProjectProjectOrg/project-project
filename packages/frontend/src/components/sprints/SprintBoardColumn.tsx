import NumberFlow from "@number-flow/react"
import { useAutoAnimate } from "@formkit/auto-animate/react"
import { AnimatePresence, motion, Reorder, useDragControls } from "motion/react"
import { GripVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview"
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source"
import { statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"
import type {
  Member,
  ProjectStatus,
  Ticket,
  TicketId
} from "@projectproject/shared"
import { SprintBoardCard } from "./SprintBoardCard"
import { useLongPress } from "./BoardReorderMode"
import type { CardDropData, ColumnDropData, DragData } from "./board-utils"

const LONG_PRESS_MS = 1500
const LONG_PRESS_S = LONG_PRESS_MS / 1000
const QUICK_S = 0.2
const REORDER_EASE = [0.32, 0.72, 0, 1] as const
const HOLD_EASE = "linear" as const
const REORDER_SCALE = 0.96
const HOLD_PEAK_SCALE = 1.015

export function SprintBoardColumn({
  orgSlug,
  slug,
  status,
  statuses,
  tickets,
  members,
  isDraggable,
  overlay,
  lastFlash,
  reorderMode,
  onActivateReorder
}: {
  orgSlug: string
  slug: string
  status: string
  statuses: ReadonlyArray<ProjectStatus>
  tickets: ReadonlyArray<Ticket>
  members: ReadonlyArray<Member>
  isDraggable: boolean
  overlay: ReadonlyMap<TicketId, string>
  lastFlash: { id: TicketId; tick: number } | null
  reorderMode: boolean
  onActivateReorder: () => void
}) {
  const [listRef] = useAutoAnimate({ duration: 180, easing: "ease-out" })
  const meta = statusMetaFor(status, statuses)
  const Icon = meta.icon
  const [columnEl, setColumnEl] = useState<HTMLElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragControls = useDragControls()

  const { holding, handlers: longPressHandlers } = useLongPress(
    onActivateReorder,
    LONG_PRESS_MS
  )

  useEffect(() => {
    if (!isDraggable || reorderMode || !columnEl) return
    return dropTargetForElements({
      element: columnEl,
      getData: (): ColumnDropData => ({ type: "column", status })
    })
  }, [isDraggable, status, reorderMode, columnEl])

  useEffect(() => {
    if (!isDraggable || reorderMode || !columnEl) return
    const update = ({
      location
    }: {
      location: {
        current: { dropTargets: ReadonlyArray<{ element: Element }> }
      }
    }) => {
      const inner = location.current.dropTargets[0]?.element
      setDragOver(inner != null && columnEl.contains(inner))
    }
    return monitorForElements({
      onDragStart: update,
      onDrag: update,
      onDrop: () => setDragOver(false)
    })
  }, [isDraggable, reorderMode, columnEl])

  const headerHoldable = isDraggable && !reorderMode
  const columnScale = isDragging
    ? 1
    : reorderMode
      ? REORDER_SCALE
      : holding
        ? HOLD_PEAK_SCALE
        : 1
  const isHoldingRamp = holding && !reorderMode
  const scaleDuration = isHoldingRamp ? LONG_PRESS_S : QUICK_S
  const scaleEase = isHoldingRamp ? HOLD_EASE : REORDER_EASE

  const onHeaderPointerDown = (e: React.PointerEvent) => {
    if (reorderMode) {
      dragControls.start(e)
      return
    }
    if (headerHoldable) longPressHandlers.onPointerDown(e)
  }

  return (
    <Reorder.Item
      value={status}
      layout="position"
      dragListener={false}
      dragControls={dragControls}
      dragElastic={0.05}
      onDragStart={() => setIsDragging(true)}
      onDragEnd={() => setIsDragging(false)}
      ref={setColumnEl}
      animate={{
        scale: columnScale,
        filter:
          reorderMode || isDragging
            ? "drop-shadow(0 10px 24px rgb(0 0 0 / 0.12))"
            : "drop-shadow(0 0 0 transparent)",
        zIndex: isDragging ? 20 : 0
      }}
      transition={{
        scale: { duration: scaleDuration, ease: scaleEase },
        filter: { duration: QUICK_S, ease: REORDER_EASE },
        zIndex: { duration: 0 }
      }}
      className="flex max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-background"
    >
      <div
        data-column-header
        onPointerDown={onHeaderPointerDown}
        onPointerMove={
          headerHoldable ? longPressHandlers.onPointerMove : undefined
        }
        onPointerUp={headerHoldable ? longPressHandlers.onPointerUp : undefined}
        onPointerCancel={
          headerHoldable ? longPressHandlers.onPointerCancel : undefined
        }
        onPointerLeave={
          headerHoldable ? longPressHandlers.onPointerLeave : undefined
        }
        className={cn(
          "relative flex items-center justify-between px-6 pt-3 pb-2 select-none",
          headerHoldable && "cursor-grab touch-none active:cursor-grabbing",
          reorderMode && "cursor-grab active:cursor-grabbing"
        )}
      >
        <motion.span
          className="inline-flex items-center gap-2 text-sm font-medium"
          animate={reorderMode ? { rotate: [-0.8, 0.8, -0.8] } : { rotate: 0 }}
          transition={
            reorderMode
              ? {
                  rotate: {
                    duration: 0.5,
                    ease: "easeInOut",
                    repeat: Infinity,
                    repeatType: "loop"
                  }
                }
              : { rotate: { duration: 0.2, ease: REORDER_EASE } }
          }
          style={{ transformOrigin: "center" }}
        >
          <Icon
            className={cn("size-4", meta.className)}
            style={meta.color ? { color: meta.color } : undefined}
            strokeWidth={1.75}
          />
          {meta.label}
        </motion.span>
        <AnimatePresence mode="wait" initial={false}>
          {reorderMode ? (
            <motion.span
              key="handle"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: QUICK_S, ease: REORDER_EASE }}
              className="text-muted-foreground"
              aria-hidden
            >
              <GripVertical className="size-4" strokeWidth={1.75} />
            </motion.span>
          ) : (
            <motion.span
              key="count"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{ duration: QUICK_S, ease: REORDER_EASE }}
            >
              <NumberFlow
                value={tickets.length}
                transformTiming={{ duration: 180, easing: "ease-out" }}
                spinTiming={{ duration: 180, easing: "ease-out" }}
                opacityTiming={{ duration: 180, easing: "ease-out" }}
                className="font-mono text-xs text-muted-foreground tabular-nums"
              />
            </motion.span>
          )}
        </AnimatePresence>
      </div>
      <motion.div
        animate={{
          opacity: reorderMode ? 0 : 1,
          y: reorderMode ? -8 : 0
        }}
        transition={{
          opacity: { duration: QUICK_S, ease: REORDER_EASE },
          y: { duration: QUICK_S, ease: REORDER_EASE }
        }}
        style={{
          pointerEvents: reorderMode ? "none" : undefined,
          transformOrigin: "top center"
        }}
        className="relative flex min-h-0 flex-1 flex-col"
      >
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
              isDraggable={isDraggable && !reorderMode}
              pending={overlay.has(t.id)}
              flashKey={lastFlash?.id === t.id ? lastFlash.tick : undefined}
            />
          ))}
        </div>
      </motion.div>
    </Reorder.Item>
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
  status: string
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
