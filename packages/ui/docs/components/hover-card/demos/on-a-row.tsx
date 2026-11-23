import { listGridClassName } from "@pp/ui/list-row"

import { Row } from "../../list-row/demos/parts/row"
import { AUDIT, EVERYTHING } from "../../list-row/demos/parts/tickets"

// A ticket row's hovers, as the backlog shows them: the sub-ticket count
// and the links count open their tickets as menu rows, and "+2" lists the
// tags that didn't fit. Rest on a chip, then move into its card.
export default function OnARow() {
  return (
    <div
      className="w-full rounded-xl surface-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <div className={listGridClassName}>
        <Row ticket={EVERYTHING} />
        <Row ticket={AUDIT} />
      </div>
    </div>
  )
}
