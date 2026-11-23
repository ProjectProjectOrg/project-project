import { Button } from "@pp/ui/button"
import { Guide } from "@pp/ui/guide"
import { ListHoverScope, listGridClassName } from "@pp/ui/list-row"
import { useRef, useState } from "react"

import { Row } from "../../list-row/demos/parts/row"
import { TICKETS } from "../../selection-bar/demos/parts/backlog"
import { LABELS } from "./parts/labels"

const SELECTED = new Set(["ATL-22", "ATL-31"])

// The guide the list shows the first time several tickets are selected: it
// spotlights the first selected row and says its fields change them all.
export default function InTheApp() {
  const [open, setOpen] = useState(false)
  const list = useRef<HTMLDivElement>(null)
  return (
    <div
      className="flex w-full flex-col gap-3 rounded-xl surface-page p-3"
      style={{ "--ticket-key-width": "6ch" }}
    >
      <div className="px-1">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          Show the guide
        </Button>
      </div>
      <div ref={list}>
        <ListHoverScope>
          <div className={listGridClassName}>
            {TICKETS.slice(0, 5).map((ticket) => (
              <div
                key={ticket.id}
                data-guide-row={SELECTED.has(ticket.id) ? "" : undefined}
                className="contents"
              >
                <Row ticket={ticket} selected={SELECTED.has(ticket.id)} />
              </div>
            ))}
          </div>
        </ListHoverScope>
      </div>
      <Guide
        open={open}
        onClose={() => setOpen(false)}
        steps={[
          {
            target: () =>
              list.current?.querySelector(
                "[data-guide-row] [data-slot=list-row]"
              ),
            title: "Edit all 2 tickets at once",
            body: "Change the status, priority, assignee, sprint or labels on any selected row, and every selected ticket gets the same change. Hover a field first to see which tickets it will change."
          }
        ]}
        labels={LABELS}
      />
    </div>
  )
}
