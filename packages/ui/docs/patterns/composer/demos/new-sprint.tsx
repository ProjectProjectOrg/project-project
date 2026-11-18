import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { DatePicker } from "@pp/ui/date-picker"
import { CalendarDays } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import * as DateTime from "effect/DateTime"
import { useState } from "react"

const DATE_LABELS = {
  placeholder: "Pick dates",
  type: "Type dates: mon for 2 weeks, nov 16 to 27",
  unreadable: "Can't read that date",
  previousMonth: "Previous month",
  nextMonth: "Next month",
  clear: "Clear dates"
} as const

const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)

type DateDraft = { from?: Date; to?: Date }

const datesLabel = (range: DateDraft) => {
  if (range.from === undefined) return "No dates"
  if (range.to === undefined) return `Starts ${formatDay(range.from)}`
  return `${formatDay(range.from)} – ${formatDay(range.to)}`
}

const twoWeeksFromToday = (): DateDraft => {
  const now = DateTime.nowUnsafe()
  return {
    from: DateTime.toDate(now),
    to: DateTime.toDate(DateTime.add(now, { days: 13 }))
  }
}

// The sprint rail's New sprint button (CreateSprintForm). LexicalEditor is
// app-only; a textarea stands in with the editor's content classes.
export default function NewSprint() {
  const [name, setName] = useState("")
  const [range, setRange] = useState<DateDraft>({})
  const today = DateTime.toDate(DateTime.nowUnsafe())
  const startsNow = range.from !== undefined && range.from <= today

  return (
    <div className="flex w-full items-start justify-center">
      <Composer.Surface>
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
          }}
        >
          <Composer.Title>
            <Input
              variant="bare"
              aria-label="Sprint name…"
              placeholder="Sprint name…"
              value={name}
              maxLength={120}
              onChange={(event) => setName(event.target.value)}
            />
          </Composer.Title>
          <Composer.Body>
            <div className="prose-md">
              <textarea
                aria-label="Add a goal or description…"
                placeholder="Add a goal or description…"
                className="lexical-content block min-h-[8rem] w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
              />
            </div>
          </Composer.Body>
          <Composer.Tray>
            <Composer.Footer>
              <DatePicker
                mode="range"
                value={{ from: range.from, to: range.to }}
                onChange={(next) => setRange({ from: next.from, to: next.to })}
                labels={DATE_LABELS}
                quickPicks={[
                  {
                    label: "Start today",
                    value: { from: undefined, ...twoWeeksFromToday() }
                  }
                ]}
                disabled={{ before: today }}
                trigger={
                  <Button
                    type="button"
                    variant="ghost"
                    tone="strong"
                    size="sm"
                    leadingIcon={CalendarDays}
                  >
                    {datesLabel(range)}
                  </Button>
                }
              />
              {range.from === undefined && (
                <Composer.Hint>Stays planned until you start it</Composer.Hint>
              )}
              <Composer.Actions>
                <Button type="button" variant="ghost" size="sm">
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={name.trim() === ""}>
                  {startsNow ? "Create and start" : "Create sprint"}
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </Composer.Surface>
    </div>
  )
}
