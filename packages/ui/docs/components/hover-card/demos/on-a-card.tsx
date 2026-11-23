import { BoardCard } from "@pp/ui/board-card"
import { ItemLink } from "@pp/ui/item-link"
import { TicketKey } from "@pp/ui/ticket-key"

import {
  AssigneeField,
  CardProperties,
  EVERYTHING
} from "../../list-row/demos/parts/tickets"

// A board card's hovers: the same chips as on a row, in the card's order.
export default function OnACard() {
  return (
    <div className="mx-auto w-full max-w-80 rounded-[22px] surface-1 p-2 [corner-shape:var(--button-corner)]">
      <BoardCard
        link={
          <ItemLink
            href={`#${EVERYTHING.id}`}
            aria-label={`${EVERYTHING.id} ${EVERYTHING.title}`}
            onClick={(event) => event.preventDefault()}
          />
        }
        meta={<TicketKey value={EVERYTHING.id} />}
        assignee={<AssigneeField assignee={EVERYTHING.assignee} size={20} />}
        title={EVERYTHING.title}
        properties={<CardProperties ticket={EVERYTHING} />}
        flagged={EVERYTHING.flagged}
      />
    </div>
  )
}
