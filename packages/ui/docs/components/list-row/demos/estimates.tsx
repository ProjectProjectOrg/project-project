import { Chip } from "@pp/ui/chip"
import { Gauge, Timer } from "@pp/ui/icons"
import { ListHoverScope, listGridClassName } from "@pp/ui/list-row"
import { Reveal } from "@pp/ui/reveal"
import { SegmentedTabs } from "@pp/ui/segmented-tabs"
import { useState } from "react"

import { Row } from "./parts/row"
import {
  AUDIT,
  CRASH,
  FOCUS,
  INVITED,
  type SampleTicket
} from "./parts/tickets"

type Unit = "points" | "time"

const TIME = new Map([
  [1, "4h"],
  [2, "1.5d"],
  [3, "2d"],
  [5, "1w"],
  [8, "1.5w"]
])

const ROWS: ReadonlyArray<SampleTicket> = [
  { ...INVITED, estimate: undefined },
  AUDIT,
  { ...FOCUS, id: "ATL-25", estimate: undefined },
  { ...CRASH, estimate: 8 },
  {
    ...FOCUS,
    id: "ATL-26",
    title: "Retry uploads after the connection comes back",
    estimate: undefined,
    pr: undefined,
    sprint: "Verification"
  },
  { ...INVITED, id: "ATL-27", title: "Remember the last used checklist" }
]

function Estimate({ value, unit }: Readonly<{ value?: number; unit: Unit }>) {
  const Icon = unit === "time" ? Timer : Gauge
  if (value === undefined)
    return (
      <Reveal>
        <Chip interaction="press" shape="count" aria-label="Add estimate">
          <Icon strokeWidth={1.75} />
        </Chip>
      </Reveal>
    )
  return (
    <Chip interaction="press" shape="count" className="tabular-nums">
      <Icon strokeWidth={1.75} />
      {unit === "time" ? TIME.get(value) : value}
    </Chip>
  )
}

export default function Estimates() {
  const [unit, setUnit] = useState<Unit>("time")
  return (
    <div className="grid w-full content-start gap-3">
      <SegmentedTabs
        variant="inline"
        aria-label="Estimate unit"
        value={unit}
        onValueChange={setUnit}
        items={[
          { key: "points", label: "Points" },
          { key: "time", label: "Time" }
        ]}
      />
      <div
        className="@container w-full rounded-xl surface-page p-3"
        style={{ "--ticket-key-width": "6ch" }}
      >
        <ListHoverScope>
          <div className={listGridClassName}>
            {ROWS.map((ticket) => (
              <Row
                key={ticket.id}
                ticket={ticket}
                estimate={<Estimate value={ticket.estimate} unit={unit} />}
              />
            ))}
          </div>
        </ListHoverScope>
      </div>
    </div>
  )
}
