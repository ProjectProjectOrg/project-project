import { BoardCard } from "@pp/ui/board-card"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"

import {
  AssigneeField,
  CardProperties,
  EVERYTHING,
  AUDIT,
  type SampleTicket
} from "../../list-row/demos/parts/tickets"

function Card({ ticket }: Readonly<{ ticket: SampleTicket }>) {
  return (
    <BoardCard
      link={
        <ItemLink
          href={`#${ticket.id}`}
          aria-label={`${ticket.id} ${ticket.title}`}
          onClick={(event) => event.preventDefault()}
        />
      }
      meta={<TicketKey value={ticket.id} />}
      assignee={<AssigneeField assignee={ticket.assignee} size={20} />}
      title={ticket.title}
      properties={<CardProperties ticket={ticket} />}
      flagged={ticket.flagged}
    />
  )
}

// A board card's chips, in the order every card uses: the state icons
// (priority, flag), the hairline, the numbers (estimate, sub-tickets, links,
// git), then the names (epic, tags, +N), which wrap last. On the flagged
// card the translucent fill keeps reading on the warm wash.
export default function OnACard() {
  return (
    <div className="@container w-full">
      <div className="mx-auto grid max-w-2xl grid-cols-1 gap-2 rounded-[22px] surface-1 p-2 [corner-shape:var(--button-corner)] @lg:grid-cols-[repeat(2,minmax(0,1fr))]">
        <Card ticket={AUDIT} />
        <Card ticket={EVERYTHING} />
      </div>
    </div>
  )
}
