import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { preserveOffsetOnSource } from "@atlaskit/pragmatic-drag-and-drop/element/preserve-offset-on-source"
import { setCustomNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/set-custom-native-drag-preview"
import type { Member, ProjectStatus, Ticket, TicketId } from "@pp/shared"
import { GripVertical } from "lucide-react"
import { motion, Reorder, useDragControls } from "motion/react"
import { useEffect, useRef, useState, type ReactNode } from "react"

import type { BoardRequest } from "@/features/sprints/atoms/sprintBoard"
import type { BacklogRequest } from "@/features/tickets/atoms/backlog"
import { statusMetaFor } from "@/lib/ticket-meta"
import { cn } from "@/lib/utils"

import type { CardDropData, ColumnDropData, DragData } from "./board-utils"
import {
  BOARD_CARD_SLOT_CLASS,
  BOARD_COLUMN_CLASS,
  BOARD_COLUMN_HEADER_CLASS,
  BoardColumnCount,
  BoardColumnTitle
} from "./BoardColumnShell"
import { useLongPress } from "./BoardReorderMode"
import { SprintBoardCard } from "./SprintBoardCard"
import { VirtualSprintCards } from "./VirtualSprintCards"

const LONG_PRESS_MS = 500
const QUICK_S = 0.2
const REORDER_EASE = [0.32, 0.72, 0, 1] as const

export function SprintBoardColumn({
  orgSlug,
  slug,
  req,
  backlogReq,
  status,
  statuses,
  tickets,
  count,
  members,
  isDraggable,
  pendingId = null,
  ordered = true,
  overlay,
  inertTicketIds,
  lastFlash,
  reorderMode,
  onActivateReorder,
  footer
}: {
  orgSlug: string
  slug: string
  req?: BoardRequest
  backlogReq?: BacklogRequest
  status: string
  statuses: ReadonlyArray<ProjectStatus>
  tickets: ReadonlyArray<Ticket>
  count?: number
  members: ReadonlyArray<Member>
  isDraggable: boolean
  pendingId?: TicketId | null
  ordered?: boolean
  overlay?: ReadonlyMap<TicketId, string>
  inertTicketIds?: ReadonlySet<TicketId>
  lastFlash: { id: TicketId; tick: number } | null
  reorderMode: boolean
  onActivateReorder: () => void
  footer?: ReactNode
}) {
  const meta = statusMetaFor(status, statuses)
  const [columnEl, setColumnEl] = useState<HTMLElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const dragControls = useDragControls()

  const { holding, handlers: longPressHandlers } = useLongPress((event) => {
    onActivateReorder()
    dragControls.start(event)
  }, LONG_PRESS_MS)

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
        filter:
          holding || isDragging
            ? "drop-shadow(0 10px 24px rgb(0 0 0 / 0.12))"
            : "drop-shadow(0 0 0 transparent)",
        zIndex: isDragging ? 20 : 0
      }}
      transition={{
        filter: { duration: QUICK_S, ease: REORDER_EASE },
        zIndex: { duration: 0 }
      }}
      className={BOARD_COLUMN_CLASS}
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
          BOARD_COLUMN_HEADER_CLASS,
          (headerHoldable || reorderMode) &&
            "cursor-grab touch-none active:cursor-grabbing"
        )}
      >
        <BoardColumnTitle meta={meta} />
        <span className="grid shrink-0 place-items-center">
          <motion.span
            initial={false}
            animate={{ opacity: reorderMode ? 1 : 0 }}
            transition={{ duration: QUICK_S, ease: REORDER_EASE }}
            className="col-start-1 row-start-1 text-muted-foreground"
            aria-hidden
          >
            <GripVertical className="size-4" strokeWidth={1.75} />
          </motion.span>
          <motion.span
            initial={false}
            animate={{ opacity: reorderMode ? 0 : 1 }}
            transition={{ duration: QUICK_S, ease: REORDER_EASE }}
            className="col-start-1 row-start-1"
            aria-hidden={reorderMode}
          >
            <BoardColumnCount value={count ?? tickets.length} />
          </motion.span>
        </span>
      </div>
      <motion.div
        animate={{
          opacity: reorderMode ? 0 : 1
        }}
        transition={{
          opacity: { duration: QUICK_S, ease: REORDER_EASE }
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
            "pointer-events-none absolute inset-x-2 top-0 bottom-2 z-0 rounded-md border border-dashed border-transparent transition-colors duration-150",
            dragOver && "border-border bg-accent/40"
          )}
        />
        <VirtualSprintCards
          tickets={tickets}
          isDraggable={isDraggable && !reorderMode}
          showDropGap={ordered}
          status={status}
          footer={footer}
        >
          {(ticket) => (
            <CardSlot
              orgSlug={orgSlug}
              slug={slug}
              req={req}
              backlogReq={backlogReq}
              ordered={ordered}
              ticket={ticket}
              status={status}
              members={members}
              isDraggable={isDraggable && !reorderMode}
              inert={inertTicketIds?.has(ticket.id) ?? false}
              pending={
                ticket.id === pendingId || (overlay?.has(ticket.id) ?? false)
              }
              flashKey={
                lastFlash?.id === ticket.id ? lastFlash.tick : undefined
              }
            />
          )}
        </VirtualSprintCards>
      </motion.div>
    </Reorder.Item>
  )
}

function CardSlot({
  orgSlug,
  slug,
  req,
  backlogReq,
  ticket,
  status,
  members,
  isDraggable,
  ordered,
  inert,
  pending,
  flashKey
}: {
  orgSlug: string
  slug: string
  req?: BoardRequest
  backlogReq?: BacklogRequest
  ticket: Ticket
  status: string
  members: ReadonlyArray<Member>
  isDraggable: boolean
  ordered: boolean
  inert: boolean
  pending: boolean
  flashKey: number | undefined
}) {
  const ticketId = ticket.id
  const ref = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!isDraggable || inert) return
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
    if (!ordered) return cleanupDrag
    const cleanupDrop = dropTargetForElements({
      element: el.closest<HTMLElement>("[data-ticket-id]") ?? el,
      getData: ({ input, element }): CardDropData => {
        const rect = element.getBoundingClientRect()
        const e: "top" | "bottom" =
          input.clientY < rect.top + rect.height / 2 ? "top" : "bottom"
        return { type: "card", id: ticketId, status, edge: e }
      }
    })
    return () => {
      cleanupDrag()
      cleanupDrop()
    }
  }, [ticketId, status, isDraggable, ordered, inert])

  return (
    <div
      ref={ref}
      inert={inert}
      aria-busy={inert}
      className={cn(BOARD_CARD_SLOT_CLASS, inert && "pointer-events-none")}
    >
      <div
        ref={cardRef}
        className={cn(
          "rounded-md",
          dragging && "opacity-40",
          (pending || inert) && "animate-pulse"
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
            req={req}
            backlogReq={backlogReq}
            ticket={ticket}
            members={members}
          />
        </motion.div>
      </div>
    </div>
  )
}
