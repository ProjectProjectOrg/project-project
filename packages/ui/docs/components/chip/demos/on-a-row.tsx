import { listGridClassName } from "@pp/ui/list-row"

import { Row } from "../../list-row/demos/parts/row"
import { EVERYTHING, FOCUS } from "../../list-row/demos/parts/tickets"

// A list row's chips: the flag and sub-tickets by the title, tags, git and
// links trailing, the estimate in its column. On a narrow list the tags
// fold into one chip of dots and a count (`show="narrow"`), so the
// title keeps its room. The second list is narrow; hover a row to see the
// chips on the hover fill.
export default function OnARow() {
  return (
    <div
      className="flex w-full flex-col gap-4 rounded-xl surface-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <div className={listGridClassName}>
        <Row ticket={EVERYTHING} />
        <Row ticket={FOCUS} force="hover" />
      </div>
      <div className="max-w-xl">
        <div className={listGridClassName}>
          <Row ticket={EVERYTHING} />
        </div>
      </div>
    </div>
  )
}
