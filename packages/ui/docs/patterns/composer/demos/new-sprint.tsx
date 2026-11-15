import { Button } from "@pp/ui/button"
import { Calendar } from "@pp/ui/calendar"
import { Composer } from "@pp/ui/composer"
import { Input } from "@pp/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import * as DateTime from "effect/DateTime"
import { CalendarDays } from "lucide-react"
import { useState } from "react"

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
  const [pickerOpen, setPickerOpen] = useState(false)
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
              <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="ghost"
                      tone="strong"
                      size="sm"
                      leadingIcon={CalendarDays}
                    />
                  }
                >
                  {datesLabel(range)}
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  initialFocus={false}
                  className="w-auto p-0"
                >
                  <Calendar
                    navLabels={{
                      previous: "Previous month",
                      next: "Next month"
                    }}
                    mode="range"
                    selected={{ from: range.from, to: range.to }}
                    onSelect={(next) => setRange(next ?? {})}
                    disabled={{ before: today }}
                    defaultMonth={range.from ?? today}
                  />
                  <div className="flex justify-between gap-2 border-t border-border/60 p-2">
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => {
                        setRange(twoWeeksFromToday())
                        setPickerOpen(false)
                      }}
                    >
                      Start today
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      disabled={range.from === undefined}
                      onClick={() => {
                        setRange({})
                        setPickerOpen(false)
                      }}
                    >
                      Clear dates
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>
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
