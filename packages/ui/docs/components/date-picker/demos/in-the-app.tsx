import { Button } from "@pp/ui/button"
import { DatePicker, type DateRange } from "@pp/ui/date-picker"
import { CalendarDays, ChevronDown, Play } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { TextSwap } from "@pp/ui/text-swap"
import * as DateTime from "effect/DateTime"
import { useState, type ReactNode } from "react"

import { rangeLabels, singleLabels } from "../labels"

const now = () => DateTime.nowUnsafe()
const today = () => DateTime.toDate(now())
const inDays = (days: number) => DateTime.toDate(DateTime.add(now(), { days }))

const fmt = new Intl.DateTimeFormat("en", { month: "short", day: "numeric" })

function Case({
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

export default function InTheApp() {
  const [dates, setDates] = useState<DateRange>({
    from: undefined,
    to: undefined
  })
  const [start, setStart] = useState<Date | undefined>(undefined)
  const [header, setHeader] = useState<DateRange>({
    from: inDays(-3),
    to: inDays(10)
  })
  const [logged, setLogged] = useState<Date | undefined>(today())

  const datesLabel =
    dates.from === undefined
      ? "No dates"
      : dates.to === undefined
        ? `Starts ${fmt.format(dates.from)}`
        : `${fmt.format(dates.from)} – ${fmt.format(dates.to)}`

  return (
    <div className="@container grid w-full gap-8 @2xl:grid-cols-[repeat(2,minmax(0,1fr))]">
      <Case caption="New sprint › dates (in the composer's tray)">
        <DatePicker
          mode="range"
          value={dates}
          onChange={setDates}
          labels={{ ...rangeLabels, clear: "Clear dates" }}
          quickPicks={[
            {
              label: "Start today",
              value: { from: today(), to: inDays(13) }
            }
          ]}
          disabled={{ before: today() }}
          trigger={
            <Button
              type="button"
              variant="ghost"
              tone="strong"
              size="sm"
              leadingIcon={CalendarDays}
            >
              {datesLabel}
            </Button>
          }
        />
      </Case>

      <Case caption="Planned sprint › Start ▾ (schedule a start day)">
        <div className="flex items-center">
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={Play}
            className="rounded-r-none"
          >
            <TextSwap>
              {start === undefined
                ? "Start sprint"
                : `Starts ${fmt.format(start)}`}
            </TextSwap>
          </Button>
          <DatePicker
            mode="single"
            align="end"
            hint="Pick the day this sprint starts."
            value={start}
            onChange={setStart}
            labels={{
              ...singleLabels,
              ...(start === undefined ? {} : { clear: "Unschedule" })
            }}
            disabled={{ before: today() }}
            trigger={
              <Button
                type="button"
                variant="tertiary"
                size="square-7"
                aria-label="Schedule sprint"
                className="-ml-px rounded-l-none"
              >
                <ChevronDown className="size-3.5" />
              </Button>
            }
          />
        </div>
      </Case>

      <Case caption="Sprint header › dates (inline; saves on close)">
        <span className="text-body text-muted-foreground">
          <DatePicker
            mode="range"
            allowPast
            value={header}
            onChange={setHeader}
            labels={rangeLabels}
            trigger={
              <button
                type="button"
                className="-mx-1 rounded px-1 tabular-nums transition-colors transition-transform duration-100 hover:bg-hover hover:text-foreground active:scale-[0.97]"
              >
                {header.from === undefined
                  ? "Not scheduled"
                  : `${fmt.format(header.from)} – ${header.to === undefined ? "…" : fmt.format(header.to)}`}
              </button>
            }
          />
        </span>
      </Case>

      <Case caption="Ticket › Log time (a form field)">
        <div className="grid w-full max-w-md grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
          <div className="flex flex-col gap-1 text-caption text-muted-foreground">
            Duration
            <Input placeholder="1h 30m" aria-label="Duration" />
          </div>
          <div className="flex flex-col gap-1 text-caption text-muted-foreground">
            Date
            <DatePicker
              mode="single"
              allowPast
              value={logged}
              onChange={setLogged}
              labels={singleLabels}
              aria-label="Date"
              className="w-full min-w-0"
            />
          </div>
        </div>
      </Case>
    </div>
  )
}
