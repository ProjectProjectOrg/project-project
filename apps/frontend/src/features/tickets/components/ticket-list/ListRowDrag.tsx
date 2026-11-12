import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine"
import {
  draggable,
  dropTargetForElements,
  monitorForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { disableNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview"
import type { ElementDragType } from "@atlaskit/pragmatic-drag-and-drop/types"
import { RegistryContext } from "@effect/atom-react"
import {
  BULK_TICKETS_MAX,
  SPRINT_SECTION_UNSCHEDULED,
  TicketId,
  TicketPriority,
  TicketRank,
  TypeKey,
  type Ticket
} from "@pp/shared"
import * as Schema from "effect/Schema"
import { motion } from "motion/react"
import {
  createContext,
  use,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import type {
  BulkTicketMoveAtom,
  TicketUpdates
} from "@/features/tickets/atoms/ticketRows"
import {
  listBulkDrop,
  listDropEdit,
  movingGap,
  sectionEdit,
  type DraggedRow,
  type ListDropTarget,
  type RowGap
} from "@/features/tickets/lib/listDrop"
import { selectionKey } from "@/features/tickets/lib/ticketSelection"
import { cn } from "@/lib/utils"

import { fireSelected } from "./selectionStore"
import { useSelectionActions, useSelectionStore } from "./TicketSelection"

const DraggedRowData = Schema.Struct({
  id: TicketId,
  ticketType: Schema.NullOr(TypeKey),
  subTicketCount: Schema.Number,
  rank: TicketRank,
  section: Schema.String
})

const RowDragData = Schema.Struct({
  type: Schema.Literal("list-row"),
  title: Schema.String,
  priority: TicketPriority,
  rows: Schema.NonEmptyArray(DraggedRowData)
})
export const isRowDragData = Schema.is(RowDragData)

const RowDropData = Schema.Struct({
  type: Schema.Literal("list-row-target"),
  gap: Schema.Union([TicketId, Schema.Literal("end")])
})
const isRowDropData = Schema.is(RowDropData)

type DragPayload = ElementDragType["payload"]["data"]

const draggedRows = (data: DragPayload): ReadonlyArray<DraggedRow> | null =>
  isRowDragData(data)
    ? data.rows.map(({ ticketType, ...row }) => ({ ...row, type: ticketType }))
    : null

type Landing = Readonly<{ ids: ReadonlyArray<TicketId>; at: number }>

const LANDING_MS = 900

export type SectionDrop = Readonly<{
  section: string
  ordered: boolean
  gap: RowGap | null
  landed: Landing | null
  settle: () => void
  accepts: (data: DragPayload) => boolean
}>

const SectionDropContext = createContext<SectionDrop | null>(null)

type SectionDropOptions = Readonly<{
  target: ListDropTarget | undefined
  tickets: ReadonlyArray<Ticket>
  update: TicketUpdates
  bulkMove: BulkTicketMoveAtom | undefined
  ordered: boolean
  canRegroup: boolean
  canLeaveSprint: boolean
}>

const acceptsRows = (data: DragPayload, options: SectionDropOptions) => {
  const rows = draggedRows(data)
  const { target } = options
  if (rows === null || target === undefined) return false
  if (rows.length > 1 && options.bulkMove === undefined) return false
  if (rows.length > BULK_TICKETS_MAX) return false
  if (rows.every((row) => row.section === target.key)) return options.ordered
  const leavesSprint = (row: DraggedRow) =>
    target.grouping === "sprint" &&
    row.section !== SPRINT_SECTION_UNSCHEDULED &&
    row.section !== target.key
  return (
    options.canRegroup &&
    rows.every(
      (row) =>
        (!leavesSprint(row) || options.canLeaveSprint) &&
        sectionEdit(row, target) !== null
    )
  )
}

export function useSectionDrop(
  ref: RefObject<HTMLElement | null>,
  options: SectionDropOptions
) {
  const registry = useContext(RegistryContext)
  const selection = useSelectionStore()
  const [over, setOver] = useState(false)
  const [gap, setGap] = useState<RowGap | null>(null)
  const [landed, setLanded] = useState<Landing | null>(null)
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  const { ordered, canRegroup, target } = options
  const key = target?.key
  const completed = target?.grouping === "sprint" && target.completed
  const active = key !== undefined && !completed && (ordered || canRegroup)

  useEffect(() => {
    const element = ref.current
    if (!element || !active) return undefined
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => acceptsRows(source.data, latest.current),
      getData: () => ({ type: "list-section" }),
      onDragEnter: ({ source }) =>
        setOver(
          draggedRows(source.data)?.some((row) => row.section !== key) ?? false
        ),
      onDrag: ({ source, location }) => {
        const rows = draggedRows(source.data)
        const inner = location.current.dropTargets[0]?.data
        setGap(
          rows === null || !isRowDropData(inner)
            ? null
            : rows.length === 1
              ? movingGap(latest.current.tickets, rows[0].id, inner.gap)
              : inner.gap
        )
      },
      onDragLeave: () => {
        setOver(false)
        setGap(null)
      },
      onDrop: ({ source, location }) => {
        setOver(false)
        setGap(null)
        const rows = draggedRows(source.data)
        const current = latest.current
        if (rows === null || current.target === undefined) return
        const inner = location.current.dropTargets[0]?.data
        const gapAt = isRowDropData(inner) ? inner.gap : null
        const at = performance.now()
        if (rows.length === 1) {
          const [row] = rows
          const edit = listDropEdit(
            row,
            current.target,
            current.tickets,
            gapAt,
            current.ordered
          )
          if (edit === null) return
          registry.set(current.update(row.id), edit)
          setLanded({ ids: [row.id], at })
          return
        }
        if (current.bulkMove === undefined) return
        const move = listBulkDrop(
          rows,
          current.target,
          current.tickets,
          gapAt,
          current.ordered
        )
        if (move === null) return
        if (selection === null) registry.set(current.bulkMove, move)
        else {
          fireSelected(
            registry,
            selection,
            current.bulkMove,
            move,
            move.tickets.length
          )
        }
        setLanded({ ids: move.tickets, at })
      }
    })
  }, [ref, active, key, registry, selection])

  const settle = () => setLanded(null)
  const drop: SectionDrop | null = active
    ? {
        section: key,
        ordered,
        gap,
        landed,
        settle,
        accepts: (data) => acceptsRows(data, latest.current)
      }
    : null
  return { drop, over, landed, settle }
}

export function SectionDropProvider({
  drop,
  children
}: Readonly<{ drop: SectionDrop | null; children: ReactNode }>) {
  return <SectionDropContext value={drop}>{children}</SectionDropContext>
}

export function DraggableRow({
  ticket,
  nextId,
  pending,
  className,
  children
}: Readonly<{
  ticket: Ticket
  nextId: TicketId | null
  pending: boolean
  className: string
  children: ReactNode
}>) {
  const drop = use(SectionDropContext)
  const { slug } = useProjectRoute()
  const selection = useSelectionActions(selectionKey(slug, ticket.id))
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const latest = useRef({ drop, selected: selection.selectedTickets })
  useLayoutEffect(() => {
    latest.current = { drop, selected: selection.selectedTickets }
  })
  const section = drop?.section
  const ordered = drop?.ordered ?? false
  const { id, type, title, priority, rank } = ticket
  const subTicketCount = ticket.subTicketCount ?? 0

  useEffect(
    () =>
      monitorForElements({
        canMonitor: ({ source }) => isRowDragData(source.data),
        onDragStart: ({ source }) =>
          setDragging(
            draggedRows(source.data)?.some((row) => row.id === id) ?? false
          ),
        onDrop: () => setDragging(false)
      }),
    [id]
  )

  useEffect(() => {
    const element = ref.current
    if (!element || section === undefined || pending) return undefined
    const gapAt = (clientY: number): RowGap => {
      const rect = element.getBoundingClientRect()
      return clientY < rect.top + rect.height / 2 ? id : (nextId ?? "end")
    }
    return combine(
      draggable({
        element,
        getInitialData: () => ({
          type: "list-row",
          title,
          priority,
          rows: [
            { id, ticketType: type, subTicketCount, rank, section },
            ...latest.current.selected.flatMap((other) =>
              other.id === id
                ? []
                : [
                    {
                      id: other.id,
                      ticketType: other.type,
                      subTicketCount: other.subTicketCount ?? 0,
                      rank: other.rank,
                      section: ""
                    }
                  ]
            )
          ]
        }),
        onGenerateDragPreview: ({ nativeSetDragImage }) =>
          disableNativeDragPreview({ nativeSetDragImage })
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          ordered && (latest.current.drop?.accepts(source.data) ?? false),
        getData: ({ input }) => ({
          type: "list-row-target",
          gap: gapAt(input.clientY)
        })
      })
    )
  }, [
    id,
    nextId,
    type,
    title,
    priority,
    rank,
    subTicketCount,
    section,
    ordered,
    pending
  ])

  const landed = drop?.landed?.ids.includes(id) ? drop.landed : null
  const gap = drop?.gap ?? null
  const edge =
    gap === id ? "top" : gap === "end" && nextId === null ? "bottom" : null

  return (
    <div
      ref={ref}
      className={cn(
        "relative isolate before:absolute before:inset-x-0 before:-top-0.5 before:h-0.5 before:content-[''] after:absolute after:inset-x-0 after:-bottom-0.5 after:h-0.5 after:content-['']",
        className,
        dragging && "opacity-40"
      )}
    >
      {children}
      {landed !== null && drop !== null && (
        <LandingFlash at={landed.at} onDone={drop.settle} />
      )}
      {edge !== null && (
        <div
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-x-2 h-0.5 rounded-full bg-foreground/60",
            edge === "top" ? "-top-[3px]" : "-bottom-[3px]"
          )}
        />
      )}
    </div>
  )
}

export function LandingFlash({
  at,
  className,
  onDone
}: Readonly<{ at: number; className?: string; onDone: () => void }>) {
  const [left] = useState(() =>
    Math.max(0, 1 - (performance.now() - at) / LANDING_MS)
  )
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: left }}
      animate={{ opacity: 0 }}
      transition={{ duration: (left * LANDING_MS) / 1000, ease: "easeOut" }}
      onAnimationComplete={onDone}
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 rounded-md bg-foreground/10",
        className
      )}
    />
  )
}

export function useListRowAutoScroll(element: HTMLElement | null) {
  useEffect(() => {
    const root = element?.closest<HTMLElement>("[data-scroll-root]")
    if (!root) return undefined
    return autoScrollForElements({
      element: root,
      canScroll: ({ source }) => isRowDragData(source.data)
    })
  }, [element])
}
