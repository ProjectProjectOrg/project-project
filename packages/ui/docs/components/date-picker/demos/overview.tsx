import { DatePicker, type DateRange } from "@pp/ui/date-picker"
import * as DateTime from "effect/DateTime"
import { useState, type ReactNode } from "react"

import { rangeLabels, singleLabels } from "../labels"

const today = () => DateTime.toDate(DateTime.nowUnsafe())

function Cell({
  caption,
  children
}: Readonly<{ caption: string; children: ReactNode }>) {
  return (
    <div className="grid min-w-0 content-start justify-items-start gap-2">
      <span className="text-caption text-muted-foreground">{caption}</span>
      {children}
    </div>
  )
}

// Open a picker and type: "fri", "nov 20", "in 3 days", or for a range
// "mon for 2 weeks" or "monday next week until two weeks later". The
// calendar previews the result; ↵ applies it.
export default function Overview() {
  const [day, setDay] = useState<Date | undefined>(undefined)
  const [range, setRange] = useState<DateRange>({
    from: undefined,
    to: undefined
  })
  const [pinned, setPinned] = useState<DateRange>({
    from: today(),
    to: DateTime.toDate(DateTime.add(DateTime.nowUnsafe(), { days: 13 }))
  })
  const [open, setOpen] = useState(true)

  return (
    <div className="@container grid w-full content-start gap-8 @2xl:grid-cols-[minmax(0,1fr)_auto]">
      <div className="grid content-start gap-6">
        <Cell caption="A day">
          <DatePicker
            mode="single"
            value={day}
            onChange={setDay}
            labels={{ ...singleLabels, clear: "Clear" }}
            quickPicks={[{ label: "Today", value: today() }]}
          />
        </Cell>
        <Cell caption="A range">
          <DatePicker
            mode="range"
            value={range}
            onChange={setRange}
            labels={{ ...rangeLabels, clear: "Clear dates" }}
            disabled={{ before: today() }}
          />
        </Cell>
      </div>
      <Cell caption="Open, with two weeks picked">
        <div className="min-h-[29rem]">
          <DatePicker
            mode="range"
            open={open}
            onOpenChange={setOpen}
            value={pinned}
            onChange={setPinned}
            labels={{ ...rangeLabels, clear: "Clear dates" }}
            disabled={{ before: today() }}
          />
        </div>
      </Cell>
    </div>
  )
}
