import { BoardCard } from "@pp/ui/board-card"
import {
  BoardCardList,
  boardCardSlotClass,
  BoardCollapsedColumnHeader,
  BoardColumnHeader,
  BoardColumnTitle
} from "@pp/ui/board-column"
import {
  BoardCardMotion,
  BoardColumnFrame,
  BoardColumns,
  boardDropOffset,
  BoardDropGap,
  boardSlotAttribute,
  useBoardCardDrag,
  useBoardCardDrop,
  useBoardColumnDrop,
  useBoardDropGap,
  useBoardEdgeScroll,
  type BoardDropData
} from "@pp/ui/board-drag"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"
import { useReducedMotion } from "motion/react"
import { useLayoutEffect, useRef, useState } from "react"

import {
  AssigneeField,
  AUDIT,
  CRASH,
  EstimateChip,
  FOCUS,
  INVITED,
  PriorityChip,
  StatusIcon,
  type SampleTicket,
  type Status
} from "../../list-row/demos/parts/tickets"

type Column = Readonly<{
  status: Status
  label: string
  tone: string
  tickets: ReadonlyArray<SampleTicket>
  collapsed: boolean
}>

const START: ReadonlyArray<Column> = [
  {
    status: "todo",
    label: "Todo",
    tone: "var(--muted-foreground)",
    tickets: [FOCUS],
    collapsed: false
  },
  {
    status: "progress",
    label: "In progress",
    tone: "var(--state-info)",
    tickets: [AUDIT, INVITED],
    collapsed: false
  },
  {
    status: "review",
    label: "In review",
    tone: "var(--state-merged)",
    tickets: [],
    collapsed: true
  },
  {
    status: "done",
    label: "Done",
    tone: "var(--state-success)",
    tickets: [CRASH],
    collapsed: false
  }
]

// A card as the board's CardSlot holds it: the whole card drags.
function Card({
  ticket,
  status
}: Readonly<{ ticket: SampleTicket; status: Status }>) {
  const slot = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const dragging = useBoardCardDrag({
    slot,
    card,
    id: ticket.id,
    status,
    enabled: true
  })
  return (
    <div ref={slot} className={boardCardSlotClass}>
      <div ref={card} className={dragging ? "opacity-40" : undefined}>
        <BoardCard
          link={
            <ItemLink
              href={`#${ticket.id}`}
              aria-label={`${ticket.id} ${ticket.title}`}
              onClick={(event) => event.preventDefault()}
            />
          }
          meta={<TicketKey value={ticket.id} />}
          assignee={<AssigneeField assignee={ticket.assignee} />}
          title={ticket.title}
          properties={
            <>
              <PriorityChip priority={ticket.priority} />
              <EstimateChip estimate={ticket.estimate} />
            </>
          }
        />
      </div>
    </div>
  )
}

// The column's cards as the app's VirtualSprintCards lays them out (here
// without virtualizing): each at its measured place, sliding aside for the
// gap a dragged card will land in.
function Cards({
  status,
  tickets
}: Readonly<{ status: Status; tickets: ReadonlyArray<SampleTicket> }>) {
  const reducedMotion = useReducedMotion() ?? false
  const scroll = useRef<HTMLDivElement>(null)
  const list = useRef<HTMLUListElement>(null)
  const [heights, setHeights] = useState<ReadonlyArray<number>>([])
  const ids = tickets.map((ticket) => ticket.id)
  useBoardEdgeScroll(scroll, true)
  const drag = useBoardDropGap(status, ids, true)
  // Each slot's height, kept current as cards come, go and resize.
  useLayoutEffect(() => {
    const element = list.current
    if (!element) return undefined
    const sizes = new ResizeObserver(() =>
      setHeights(
        [...element.children].flatMap((child) =>
          child.hasAttribute(boardSlotAttribute)
            ? [child.getBoundingClientRect().height]
            : []
        )
      )
    )
    const watch = () => {
      sizes.disconnect()
      for (const child of element.children) sizes.observe(child)
    }
    watch()
    const slots = new MutationObserver(watch)
    slots.observe(element, { childList: true })
    return () => {
      sizes.disconnect()
      slots.disconnect()
    }
  }, [])
  const starts = heights.map((_, index) =>
    heights.slice(0, index).reduce((sum, height) => sum + height, 0)
  )
  const total = heights.reduce((sum, height) => sum + height, 0)
  const sourceIndex = drag ? ids.indexOf(drag.id) : -1
  const gapStart =
    drag?.index != null
      ? (starts[drag.index] ?? total) -
        (sourceIndex >= 0 && sourceIndex < drag.index ? drag.height : 0)
      : null
  return (
    <BoardCardList scrollLabel="Scrollable" viewportProps={{ ref: scroll }}>
      <ul
        ref={list}
        className="relative w-full"
        style={{
          paddingBottom:
            drag?.index != null && sourceIndex < 0 ? drag.height : 0
        }}
      >
        {gapStart !== null && drag && (
          <BoardDropGap top={gapStart} height={drag.height} />
        )}
        {tickets.map((ticket, index) => (
          <li key={ticket.id} {...{ [boardSlotAttribute]: "" }}>
            <BoardCardMotion
              index={index}
              start={starts[index] ?? 0}
              offset={boardDropOffset(drag, index, sourceIndex)}
              hidden={drag?.id === ticket.id}
              reducedMotion={reducedMotion}
            >
              <Card ticket={ticket} status={status} />
            </BoardCardMotion>
          </li>
        ))}
      </ul>
    </BoardCardList>
  )
}

function DemoColumn({
  column,
  onFold,
  onMove,
  onReorder
}: Readonly<{
  column: Column
  onFold: (collapsed: boolean) => void
  onMove: (delta: -1 | 1) => void
  onReorder: (reordering: boolean) => void
}>) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const over = useBoardColumnDrop(element, column.status, true)
  const glyph = <StatusIcon status={column.status} />
  return (
    <BoardColumnFrame
      ref={setElement}
      value={column.status}
      tone={column.tone}
      collapsed={column.collapsed}
      over={over}
      onReorderStart={() => onReorder(true)}
      onReorderEnd={() => onReorder(false)}
    >
      {({ startReorder }) =>
        column.collapsed ? (
          <BoardCollapsedColumnHeader
            icon={glyph}
            label={column.label}
            count={column.tickets.length}
            expandLabel={`Expand ${column.label}`}
            onExpand={() => onFold(false)}
          />
        ) : (
          <div className="flex min-h-0 w-72 flex-1 shrink-0 flex-col">
            <BoardColumnHeader
              title={<BoardColumnTitle icon={glyph} label={column.label} />}
              count={column.tickets.length}
              onCollapse={() => onFold(true)}
              collapseLabel={`Collapse ${column.label}`}
              onReorderStart={startReorder}
              onReorderKey={onMove}
              reorderLabel={`Move ${column.label}`}
            />
            <Cards status={column.status} tickets={column.tickets} />
          </div>
        )
      }
    </BoardColumnFrame>
  )
}

// Where a dropped card goes: before or after the card it was dropped on, or
// at the end of a column's empty space.
const placeCard = (
  columns: ReadonlyArray<Column>,
  id: string,
  target: BoardDropData
): ReadonlyArray<Column> => {
  const ticket = columns
    .flatMap((column) => column.tickets)
    .find((entry) => entry.id === id)
  if (ticket === undefined) return columns
  return columns.map((column) => {
    const rest = column.tickets.filter((entry) => entry.id !== id)
    if (column.status !== target.status) return { ...column, tickets: rest }
    const at =
      target.type === "column"
        ? rest.length
        : rest.findIndex((entry) => entry.id === target.id) +
          (target.edge === "bottom" ? 1 : 0)
    return {
      ...column,
      tickets: [...rest.slice(0, at), ticket, ...rest.slice(at)]
    }
  })
}

// The sprint board's drag, from @pp/ui/board-drag: drag a column by its
// grip (or focus the grip and use the arrow keys), drag a card within its
// column or onto another (a folded one too) to see the gap, the drop ring
// and the counts roll, and fold or unfold columns.
export default function Overview() {
  const [columns, setColumns] = useState(START)
  const [reordering, setReordering] = useState(false)
  useBoardCardDrop(true, (card, target) =>
    setColumns((current) => placeCard(current, card.id, target))
  )
  const moveColumn = (status: Status, delta: -1 | 1) =>
    setColumns((current) => {
      const from = current.findIndex((column) => column.status === status)
      const to = from + delta
      if (to < 0 || to >= current.length) return current
      const next = [...current]
      const [moved] = next.splice(from, 1)
      if (moved !== undefined) next.splice(to, 0, moved)
      return next
    })
  return (
    <div className="w-full overflow-x-auto">
      <BoardColumns
        values={columns.map((column) => column.status)}
        reordering={reordering}
        onReorder={(next) =>
          setColumns((current) =>
            next.flatMap((status) =>
              current.filter((column) => column.status === status)
            )
          )
        }
        className="flex h-[30rem] gap-3 p-1"
      >
        {columns.map((column) => (
          <DemoColumn
            key={column.status}
            column={column}
            onFold={(collapsed) =>
              setColumns((current) =>
                current.map((entry) =>
                  entry.status === column.status
                    ? { ...entry, collapsed }
                    : entry
                )
              )
            }
            onMove={(delta) => moveColumn(column.status, delta)}
            onReorder={setReordering}
          />
        ))}
      </BoardColumns>
    </div>
  )
}
