import { Button } from "@pp/ui/button"
import { Calendar } from "@pp/ui/calendar"
import { Composer } from "@pp/ui/composer"
import { Input } from "@pp/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@pp/ui/popover"
import * as DateTime from "effect/DateTime"
import { CalendarDays, Plus } from "lucide-react"
import { useState } from "react"

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

const twoWeeksFromToday = (): DateDraft => {
  const now = DateTime.nowUnsafe()
  return {
    from: DateTime.toDate(now),
    to: DateTime.toDate(DateTime.add(now, { days: 13 }))
  }
}

const SPRINTS = ["Sprint 14", "Sprint 13", "Sprint 12"]

// The sprint rail's "New sprint" button (in the sidebar, on the frame) opens
// the sprint composer: a popover holding a whole form, with a second popover
// nested inside for the date range.
export default function NewSprint() {
  const [open, setOpen] = useState(true)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [name, setName] = useState("")
  const [range, setRange] = useState<DateDraft>({})
  const today = DateTime.toDate(DateTime.nowUnsafe())
  const startsNow = range.from !== undefined && range.from <= today

  return (
    <div className="flex w-60 flex-col gap-0.5 rounded-[20px] bg-background p-2 corner-squircle">
      {SPRINTS.map((sprint) => (
        <p key={sprint} className="px-2 py-1.5 text-body text-muted-foreground">
          {sprint}
        </p>
      ))}
      <Popover
        open={open}
        onOpenChange={(next, details) => {
          if (USER_TOGGLES.has(details.reason)) setOpen(next)
        }}
        modal="trap-focus"
      >
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="dither"
              className="mt-1 w-full justify-start text-primary-foreground"
              leadingIcon={Plus}
              ditherFrom="var(--primary)"
              ditherTo="var(--background)"
              ditherDirection="r"
              ditherStops={[0.7, 1]}
              ditherHoverStops={[0.5, 1]}
            />
          }
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
            <Composer.Title className="mt-4">
              <Input
                variant="bare"
                className="text-title font-semibold"
                aria-label="Sprint name…"
                placeholder="Sprint name…"
                value={name}
                maxLength={120}
                onChange={(event) => setName(event.target.value)}
              />
            </Composer.Title>
            <Composer.Body>
              <textarea
                aria-label="Description"
                placeholder="Add a goal or description…"
                rows={3}
                className="w-full resize-none bg-transparent text-body outline-none placeholder:text-muted-foreground"
              />
            </Composer.Body>
            <Composer.Footer className="justify-between pl-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
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
                  <Composer.Hint>
                    Stays planned until you start it
                  </Composer.Hint>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
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
              </div>
            </Composer.Footer>
          </form>
        </Composer.Popover>
      </Popover>
    </div>
  )
}
