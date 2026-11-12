import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine"
import {
  draggable,
  dropTargetForElements
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { disableNativeDragPreview } from "@atlaskit/pragmatic-drag-and-drop/element/disable-native-drag-preview"
import type { ElementDragType } from "@atlaskit/pragmatic-drag-and-drop/types"
import { RegistryContext } from "@effect/atom-react"
import { TicketId, TicketPriority, TypeKey, type Ticket } from "@pp/shared"
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

import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import {
  listDropEdit,
  movingGap,
  sectionEdit,
  type DraggedRow,
  type ListDropTarget,
  type RowGap
} from "@/features/tickets/lib/listDrop"
import { cn } from "@/lib/utils"

import { useIgnoreListHover } from "./ListKeyboard"

const RowDragData = Schema.Struct({
  type: Schema.Literal("list-row"),
  id: TicketId,
  ticketType: Schema.NullOr(TypeKey),
  title: Schema.String,
  priority: TicketPriority,
  subTicketCount: Schema.Number,
  section: Schema.String
})
export const isRowDragData = Schema.is(RowDragData)

const RowDropData = Schema.Struct({
  type: Schema.Literal("list-row-target"),
  gap: Schema.Union([TicketId, Schema.Literal("end")])
})
const isRowDropData = Schema.is(RowDropData)

type DragPayload = ElementDragType["payload"]["data"]

const draggedRow = (data: DragPayload): DraggedRow | null =>
  isRowDragData(data)
    ? {
        id: data.id,
        type: data.ticketType,
        subTicketCount: data.subTicketCount,
        section: data.section
      }
    : null

type Landing = Readonly<{ id: TicketId; at: number }>

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
  ordered: boolean
  canRegroup: boolean
}>

const acceptsRow = (data: DragPayload, options: SectionDropOptions) => {
  const row = draggedRow(data)
  if (row === null || options.target === undefined) return false
  if (row.section === options.target.key) return options.ordered
  return options.canRegroup && sectionEdit(row, options.target) !== null
}

export function useSectionDrop(
  ref: RefObject<HTMLElement | null>,
  options: SectionDropOptions
) {
  const registry = useContext(RegistryContext)
  const [over, setOver] = useState(false)
  const [gap, setGap] = useState<RowGap | null>(null)
  const [landed, setLanded] = useState<Landing | null>(null)
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  const { ordered, canRegroup } = options
  const key = options.target?.key
  const active = key !== undefined && (ordered || canRegroup)

  useEffect(() => {
    const element = ref.current
    if (!element || !active) return undefined
    return dropTargetForElements({
      element,
      canDrop: ({ source }) => acceptsRow(source.data, latest.current),
      getData: () => ({ type: "list-section" }),
      onDragEnter: ({ source }) =>
        setOver(draggedRow(source.data)?.section !== key),
      onDrag: ({ source, location }) => {
        const row = draggedRow(source.data)
        const inner = location.current.dropTargets[0]?.data
        setGap(
          row !== null && isRowDropData(inner)
            ? movingGap(latest.current.tickets, row.id, inner.gap)
            : null
        )
      },
      onDragLeave: () => {
        setOver(false)
        setGap(null)
      },
      onDrop: ({ source, location }) => {
        setOver(false)
        setGap(null)
        const row = draggedRow(source.data)
        const current = latest.current
        if (row === null || current.target === undefined) return
        const inner = location.current.dropTargets[0]?.data
        const edit = listDropEdit(
          row,
          current.target,
          current.tickets,
          isRowDropData(inner) ? inner.gap : null,
          current.ordered
        )
        if (edit === null) return
        registry.set(current.update(row.id), edit)
        setLanded({ id: row.id, at: performance.now() })
      }
    })
  }, [ref, active, key, registry])

  const settle = () => setLanded(null)
  const drop: SectionDrop | null = active
    ? {
        section: key,
        ordered,
        gap,
        landed,
        settle,
        accepts: (data) => acceptsRow(data, latest.current)
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
  const ignoreHover = useIgnoreListHover()
  const ref = useRef<HTMLDivElement>(null)
  const [dragging, setDragging] = useState(false)
  const latest = useRef(drop)
  useLayoutEffect(() => {
    latest.current = drop
  })
  const section = drop?.section
  const ordered = drop?.ordered ?? false
  const { id, type, title, priority } = ticket
  const subTicketCount = ticket.subTicketCount ?? 0

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
          id,
          ticketType: type,
          title,
          priority,
          subTicketCount,
          section
        }),
        onGenerateDragPreview: ({ nativeSetDragImage }) =>
          disableNativeDragPreview({ nativeSetDragImage }),
        onDragStart: () => setDragging(true),
        onDrop: () => {
          setDragging(false)
          ignoreHover()
        }
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          ordered && (latest.current?.accepts(source.data) ?? false),
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
    subTicketCount,
    section,
    ordered,
    pending,
    ignoreHover
  ])

  const landed = drop?.landed?.id === id ? drop.landed : null
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
