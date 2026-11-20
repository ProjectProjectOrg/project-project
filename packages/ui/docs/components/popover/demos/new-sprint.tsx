import { Button } from "@pp/ui/button"
import { Composer } from "@pp/ui/composer"
import { DatePicker } from "@pp/ui/date-picker"
import { CalendarDays, Plus } from "@pp/ui/icons"
import { Input } from "@pp/ui/input"
import { Popover, PopoverTrigger } from "@pp/ui/popover"
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

const USER_TOGGLES = new Set([
  "trigger-press",
  "escape-key",
  "close-press",
  "outside-press"
])

const formatDay = (date: Date) =>
  new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(date)

type DateDraft = { from?: Date; to?: Date }

const datesLabel = (range: DateDraft) => {
  if (range.from === undefined) return "No dates"
  if (range.to === undefined) return `Starts ${formatDay(range.from)}`
  return `${formatDay(range.from)} – ${formatDay(range.to)}`
}

const twoWeeksFromToday = () => {
  const now = DateTime.nowUnsafe()
  return {
    from: DateTime.toDate(now),
    to: DateTime.toDate(DateTime.add(now, { days: 13 }))
  }
}

// The sprints overview's New sprint button opens the sprint composer
// (NewSprintPopover + CreateSprintForm): a whole form in a popover, with the
// date range picker nested inside. LexicalEditor is app-only; a textarea
// stands in with the editor's content classes.
export default function NewSprint() {
  const [open, setOpen] = useState(true)
  const [name, setName] = useState("")
  const [range, setRange] = useState<DateDraft>({})
  const today = DateTime.toDate(DateTime.nowUnsafe())
  const startsNow = range.from !== undefined && range.from <= today

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        if (USER_TOGGLES.has(details.reason)) setOpen(next)
      }}
      modal="trap-focus"
    >
      <PopoverTrigger
        render={<Button variant="primary" size="sm" leadingIcon={Plus} />}
      >
        New sprint
      </PopoverTrigger>
      <Composer.Popover align="start" sideOffset={6} aria-label="New sprint">
        <form
          className="flex flex-col"
          onSubmit={(event) => {
            event.preventDefault()
            setOpen(false)
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
                    value: twoWeeksFromToday()
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
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" size="sm" disabled={name.trim() === ""}>
                  {startsNow ? "Create and start" : "Create sprint"}
                </Button>
              </Composer.Actions>
            </Composer.Footer>
          </Composer.Tray>
        </form>
      </Composer.Popover>
    </Popover>
  )
}
