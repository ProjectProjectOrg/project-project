import { useAtomSet } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import { Button } from "@pp/ui/button"
import { ButtonGroup } from "@pp/ui/button-group"
import { DatePicker } from "@pp/ui/date-picker"
import { ChevronDown, Play } from "@pp/ui/icons"
import { useState } from "react"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  updateSprint
} from "@/features/sprints/atoms/sprintList"
import { nowDate, startSprintPatch } from "@/features/sprints/lib/sprintDates"
import { dateLabels } from "@/lib/dateLabels"
import { m } from "@/paraglide/messages"

export function SprintStartButton({ sprint }: { sprint: Group }) {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const update = useAtomSet(updateSprint({ req, groupId: sprint.id }))
  const [scheduling, setScheduling] = useState(false)
  if (sprintState(sprint) !== "planned") return null
  const today = nowDate()
  return (
    <ButtonGroup>
      <Button
        type="button"
        variant="tertiary"
        size="sm"
        leadingIcon={Play}
        onClick={() => update(startSprintPatch(sprint, nowDate()))}
      >
        {m.sprints_start_button()}
      </Button>
      <DatePicker
        mode="single"
        open={scheduling}
        onOpenChange={setScheduling}
        align="end"
        hint={m.sprints_schedule_pick_hint()}
        value={sprint.startsAt ?? undefined}
        onChange={(date) =>
          update(
            date === undefined
              ? { startsAt: null, endsAt: null }
              : startSprintPatch(sprint, date)
          )
        }
        labels={dateLabels(
          "single",
          sprint.startsAt === null ? undefined : m.sprints_unschedule()
        )}
        disabled={{ before: today }}
        trigger={
          <Button
            type="button"
            variant="tertiary"
            size="square-7"
            aria-label={m.sprints_schedule_button()}
          >
            <ChevronDown className="size-3.5" strokeWidth={1.75} />
          </Button>
        }
      />
    </ButtonGroup>
  )
}
