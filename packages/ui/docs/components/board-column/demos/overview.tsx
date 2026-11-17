import { BoardCard } from "@pp/ui/board-card"
import {
  BoardCardList,
  boardCardSlotClass,
  BoardCollapsedColumnHeader,
  BoardColumn,
  boardCollapsedColumnClass,
  boardColumnClass,
  BoardColumnHeader,
  BoardColumnTitle
} from "@pp/ui/board-column"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"
import { useState } from "react"

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

function Card({ ticket }: Readonly<{ ticket: SampleTicket }>) {
  return (
    <div className={boardCardSlotClass}>
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
  )
}

// A column that folds, as the sprint board builds it from the parts.
function FoldingColumn({
  status,
  label,
  tickets,
  reorderMode = false
}: Readonly<{
  status: Status
  label: string
  tickets: ReadonlyArray<SampleTicket>
  reorderMode?: boolean
}>) {
  const [collapsed, setCollapsed] = useState(false)
  const glyph = <StatusIcon status={status} />
  if (collapsed) {
    return (
      <section className={boardCollapsedColumnClass}>
        <BoardCollapsedColumnHeader
          icon={glyph}
          label={label}
          count={tickets.length}
          expandLabel={`Expand ${label}`}
          onExpand={() => setCollapsed(false)}
        />
      </section>
    )
  }
  return (
    <section className={boardColumnClass}>
      <BoardColumnHeader
        title={<BoardColumnTitle icon={glyph} label={label} />}
        count={tickets.length}
        reorderMode={reorderMode}
        onCollapse={() => setCollapsed(true)}
        collapseLabel={`Collapse ${label}`}
      />
      <BoardCardList scrollLabel="Scrollable">
        {tickets.map((ticket) => (
          <Card key={ticket.id} ticket={ticket} />
        ))}
      </BoardCardList>
    </section>
  )
}

export default function Overview() {
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex h-[30rem] gap-3 p-1">
        <FoldingColumn
          status="progress"
          label="In progress · fold me"
          tickets={[AUDIT, INVITED]}
        />
        <FoldingColumn
          status="review"
          label="In review · reordering"
          tickets={[FOCUS]}
          reorderMode
        />
        <section className={boardCollapsedColumnClass}>
          <BoardCollapsedColumnHeader
            icon={<StatusIcon status="todo" />}
            label="Todo · drop target"
            count={3}
            expandLabel="Expand Todo · drop target"
            highlighted
          />
        </section>
        <BoardColumn
          title={
            <BoardColumnTitle
              icon={<StatusIcon status="done" />}
              label="Done · plain"
            />
          }
          count={1}
          scrollLabel="Scrollable"
        >
          <Card ticket={CRASH} />
        </BoardColumn>
      </div>
    </div>
  )
}
