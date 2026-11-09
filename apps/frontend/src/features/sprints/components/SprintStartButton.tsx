import { useAtomSet } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import { CalendarX, ChevronDown, Play } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger
} from "@/components/ui/popover"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { startSprintPatch } from "@/features/sprints/lib/sprintDates"
import { m } from "@/paraglide/messages"

import { nowDate } from "./SprintHeaderFields"

export function SprintStartButton({ sprint }: { sprint: Group }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }))
  const [scheduling, setScheduling] = useState(false)
  if (sprintState(sprint) !== "planned") return null
  const today = nowDate()
  return (
    <div className="flex items-center">
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        leadingIcon={Play}
        onClick={() => update(startSprintPatch(sprint, nowDate()))}
        className="rounded-r-none"
      >
        {m.sprints_start_button()}
      </Button>
      <Popover open={scheduling} onOpenChange={setScheduling}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="tertiary"
              size="square-7"
              aria-label={m.sprints_schedule_button()}
              className="-ml-px rounded-l-none"
            >
              <ChevronDown className="size-3.5" strokeWidth={1.75} />
            </Button>
          }
        />
        <PopoverContent align="end" className="w-auto p-0">
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            {m.sprints_schedule_pick_hint()}
          </p>
          <Calendar
            mode="single"
            selected={sprint.startsAt ?? undefined}
            onSelect={(date) => {
              if (date === undefined) return
              update(startSprintPatch(sprint, date))
              setScheduling(false)
            }}
            disabled={{ before: today }}
            numberOfMonths={1}
            defaultMonth={sprint.startsAt ?? today}
          />
          {sprint.startsAt !== null && (
            <div className="border-t border-border/60 p-2">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                leadingIcon={CalendarX}
                onClick={() => {
                  update({ startsAt: null, endsAt: null })
                  setScheduling(false)
                }}
              >
                {m.sprints_unschedule()}
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
