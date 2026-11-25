import { BoardCard } from "@pp/ui/board-card"
import {
  BoardCardList,
  boardCardSlotClass,
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
  useBoardColumnRefusal,
  useBoardDropGap,
  BoardDropData,
  type BoardColumnRefusal
} from "@pp/ui/board-drag"
import { ItemLink } from "@pp/ui/item-link"
import { StatusLock, StatusLockNote } from "@pp/ui/status-lock"
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
} from "../../../components/list-row/demos/parts/tickets"
import {
  dragReason,
  dragTitle,
  LOCKED,
  lockLabel,
  lockReason,
  RoleTabs,
  type Role
} from "./parts/lock"

type Column = Readonly<{
  status: Status
  label: string
  tone: string
  tickets: ReadonlyArray<SampleTicket>
}>

const START: ReadonlyArray<Column> = [
  {
    status: "todo",
    label: "Todo",
    tone: "var(--muted-foreground)",
    tickets: [INVITED]
  },
  {
    status: "progress",
    label: "In progress",
    tone: "var(--state-info)",
    tickets: [AUDIT]
  },
  {
    status: "review",
    label: "In review",
    tone: "var(--state-merged)",
    tickets: [FOCUS]
  },
  {
    status: "done",
    label: "Done",
    tone: "var(--state-success)",
    tickets: [CRASH]
  }
]

function Card({
  ticket,
  status,
  refusesMoves
}: Readonly<{ ticket: SampleTicket; status: Status; refusesMoves: boolean }>) {
  const slot = useRef<HTMLDivElement>(null)
  const card = useRef<HTMLDivElement>(null)
  const dragging = useBoardCardDrag({
    slot,
    card,
    id: ticket.id,
    status,
    enabled: true,
    refusesMoves
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

function Cards({
  status,
  tickets,
  refusesMoves
}: Readonly<{
  status: Status
  tickets: ReadonlyArray<SampleTicket>
  refusesMoves: boolean
}>) {
  const reducedMotion = useReducedMotion() ?? false
  const list = useRef<HTMLUListElement>(null)
  const [heights, setHeights] = useState<ReadonlyArray<number>>([])
  const ids = tickets.map((ticket) => ticket.id)
  const drag = useBoardDropGap(status, ids, true)
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
    <ul
      ref={list}
      className="relative w-full"
      style={{
        paddingBottom: drag?.index != null && sourceIndex < 0 ? drag.height : 0
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
            <Card
              ticket={ticket}
              status={status}
              refusesMoves={refusesMoves}
            />
          </BoardCardMotion>
        </li>
      ))}
    </ul>
  )
}

export function LockedColumn({
  column,
  role,
  forced
}: Readonly<{
  column: Column
  role: Role
  forced?: BoardColumnRefusal | "pm-dragging"
}>) {
  const [element, setElement] = useState<HTMLElement | null>(null)
  const locked = column.status in LOCKED
  const refusesMoves = locked && role !== "pm"
  const over = useBoardColumnDrop(element, column.status, true, refusesMoves)
  const live = useBoardColumnRefusal(element, column.status, locked)
  const refusal =
    forced === "pm-dragging" ? "dragging" : (forced ?? (locked ? live : null))
  return (
    <BoardColumnFrame
      ref={setElement}
      value={column.status}
      tone={column.tone}
      over={over}
      data-refusing={(refusesMoves && refusal) || undefined}
    >
      {() => (
        <div className="flex min-h-0 w-72 flex-1 shrink-0 flex-col">
          <BoardColumnHeader
            title={
              <>
                <BoardColumnTitle
                  icon={<StatusIcon status={column.status} />}
                  label={column.label}
                />
                {locked ? (
                  <StatusLock
                    label={lockLabel}
                    reason={lockReason(column.status, role)}
                    open={forced === undefined ? undefined : false}
                    className="-mx-1"
                  />
                ) : null}
              </>
            }
            count={column.tickets.length}
          />
          <BoardCardList scrollLabel="Scrollable">
            {locked ? (
              <StatusLockNote
                refusal={refusal}
                title={dragTitle(role)}
                reason={dragReason(column.status, role)}
                className="mx-2 mb-1"
              />
            ) : null}
            <Cards
              status={column.status}
              tickets={column.tickets}
              refusesMoves={refusesMoves}
            />
          </BoardCardList>
        </div>
      )}
    </BoardColumnFrame>
  )
}

const placeCard = (
  columns: ReadonlyArray<Column>,
  id: string,
  target: BoardDropData
) => {
  const ticket = columns
    .flatMap((column) => column.tickets)
    .find((entry) => entry.id === id)
  if (ticket === undefined) return columns
  return columns.map((column) => {
    const rest = column.tickets.filter((entry) => entry.id !== id)
    if (column.status !== target.status) return { ...column, tickets: rest }
    const at = BoardDropData.match(target, {
      column: () => rest.length,
      card: (drop) =>
        rest.findIndex((entry) => entry.id === drop.id) +
        (drop.edge === "bottom" ? 1 : 0)
    })
    return {
      ...column,
      tickets: [...rest.slice(0, at), ticket, ...rest.slice(at)]
    }
  })
}

export const BOARD_START = START

export default function Board() {
  const [columns, setColumns] = useState(START)
  const [role, setRole] = useState<Role>("developer")
  useBoardCardDrop(true, (card, target) =>
    setColumns((current) => placeCard(current, card.id, target))
  )
  return (
    <div className="flex w-full flex-col gap-4">
      <RoleTabs role={role} onRole={setRole} />
      <div className="w-full overflow-x-auto">
        <BoardColumns
          values={columns.map((column) => column.status)}
          reordering={false}
          onReorder={() => undefined}
          className="flex h-[26rem] gap-3 p-1"
        >
          {columns.map((column) => (
            <LockedColumn key={column.status} column={column} role={role} />
          ))}
        </BoardColumns>
      </div>
    </div>
  )
}
