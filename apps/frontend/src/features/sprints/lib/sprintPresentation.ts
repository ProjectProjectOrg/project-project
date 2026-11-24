import { sprintState, type Group } from "@pp/shared"
import { Flag, Trophy, Zap, type IconType } from "@pp/ui/icons"
import * as Match from "effect/Match"

import { m } from "@/paraglide/messages"

import {
  daysBetween,
  shortDateFormatter,
  sprintCountdown,
  SprintCountdown
} from "./sprintDates"

export type SprintStateName = ReturnType<typeof sprintState>

export type SprintTiming = Pick<Group, "completedAt" | "startsAt" | "endsAt">

export const SPRINT_STATE_META: Record<
  SprintStateName,
  { icon: IconType; className: string }
> = {
  planned: { icon: Flag, className: "text-muted-foreground" },
  active: { icon: Zap, className: "text-state-info" },
  completed: { icon: Trophy, className: "text-state-success" }
}

export const sprintStateLabel = (state: SprintStateName) =>
  Match.value(state).pipe(
    Match.when("planned", () => m.sprints_planned_label()),
    Match.when("active", () => m.sprints_active_label()),
    Match.orElse(() => m.sprints_completed_label())
  )

export const countdownLabel = (countdown: SprintCountdown) =>
  SprintCountdown.$match(countdown, {
    noEnd: () => m.sprints_no_end_date(),
    left: ({ days }) => m.sprints_active_with_days_left({ days }),
    lastDay: () => m.sprints_last_day(),
    ended: ({ days }) => m.sprints_ended_days_ago({ days })
  })

export const sprintStatusText = (sprint: SprintTiming, now: Date) =>
  Match.value(sprintState(sprint, now)).pipe(
    Match.when("planned", () =>
      sprint.startsAt === null
        ? null
        : m.sprints_starts_in_days({ days: daysBetween(now, sprint.startsAt) })
    ),
    Match.when("active", () => countdownLabel(sprintCountdown(sprint, now))),
    Match.orElse(() =>
      sprint.completedAt === null
        ? null
        : m.sprints_completed_at({
            date: shortDateFormatter().format(sprint.completedAt)
          })
    )
  )
