import { sprintState, type Group } from "@pp/shared"
import { localToday } from "@pp/ui/lib/parseDate"
import * as Data from "effect/Data"
import * as DateTime from "effect/DateTime"

import { m } from "@/paraglide/messages"
import { getLocale } from "@/paraglide/runtime"

export type SprintDateDraft = Readonly<{
  from?: Date | undefined
  to?: Date | undefined
}>

export type SprintDatesPatch = Readonly<{
  startsAt: Date | null
  endsAt: Date | null
}>

export const sprintDateDraft = (
  sprint: Pick<Group, "startsAt" | "endsAt">
) => ({
  from: sprint.startsAt ?? undefined,
  to: sprint.endsAt ?? undefined
})

export const sprintDatesPatch = (
  sprint: Pick<Group, "startsAt" | "endsAt">,
  draft: SprintDateDraft
) => {
  const startsAt = draft.from ?? null
  const endsAt = draft.to ?? null
  return startsAt?.getTime() !== sprint.startsAt?.getTime() ||
    endsAt?.getTime() !== sprint.endsAt?.getTime()
    ? ({ startsAt, endsAt } satisfies SprintDatesPatch)
    : null
}

export const formatSprintRange = (from: Date, to: Date) => {
  const format = new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })
  return `${format.format(from)} – ${format.format(to)}`
}

export const formatSprintDates = ({ from, to }: SprintDateDraft) =>
  from === undefined
    ? null
    : to === undefined
      ? m.sprints_starts_on({
          date: new Intl.DateTimeFormat(getLocale(), {
            month: "short",
            day: "numeric"
          }).format(from)
        })
      : formatSprintRange(from, to)

export const nowDate = () => DateTime.toDate(DateTime.nowUnsafe())

export const timeOr = (date: Date | null, fallback: number) =>
  date?.getTime() ?? fallback

const WEEK_DAYS = 7

export const sprintLengthAdjective = (days: number) =>
  days % WEEK_DAYS === 0
    ? m.sprints_length_adjective_weeks({ count: days / WEEK_DAYS })
    : m.sprints_length_adjective_days({ count: days })

export const DEFAULT_SPRINT_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (date: Date) => localToday(DateTime.makeUnsafe(date))

export const startOfDay = (date: Date) => DateTime.toDateUtc(dayOf(date))

export const addDays = (date: Date, days: number) =>
  DateTime.toDateUtc(DateTime.add(dayOf(date), { days }))

export const daysBetween = (from: Date, to: Date) =>
  Math.round(
    (DateTime.toEpochMillis(dayOf(to)) - DateTime.toEpochMillis(dayOf(from))) /
      DAY_MS
  )

export const sprintLengthDays = (sprint: Pick<Group, "startsAt" | "endsAt">) =>
  sprint.startsAt === null ||
  sprint.endsAt === null ||
  sprint.endsAt < sprint.startsAt
    ? null
    : daysBetween(sprint.startsAt, sprint.endsAt) + 1

export const defaultSprintRange = (
  now: DateTime.Utc = DateTime.nowUnsafe()
) => {
  const from = startOfDay(DateTime.toDate(now))
  return {
    from,
    to: addDays(from, DEFAULT_SPRINT_DAYS - 1)
  } satisfies SprintDateDraft
}

export const startSprintPatch = (
  sprint: Pick<Group, "startsAt" | "endsAt">,
  start: Date
) => {
  const startsAt = startOfDay(start)
  const length = sprintLengthDays(sprint) ?? DEFAULT_SPRINT_DAYS
  return {
    startsAt,
    endsAt: addDays(startsAt, length - 1)
  } satisfies SprintDatesPatch
}

export type SprintCountdown = Data.TaggedEnum<{
  noEnd: {}
  left: Readonly<{ days: number }>
  lastDay: {}
  ended: Readonly<{ days: number }>
}>
export const SprintCountdown = Data.taggedEnum<SprintCountdown>()

export const sprintCountdown = (
  sprint: Pick<Group, "endsAt">,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
) => {
  if (sprint.endsAt === null) return SprintCountdown.noEnd()
  const days = daysBetween(now, sprint.endsAt)
  if (days > 0) return SprintCountdown.left({ days })
  if (days === 0) return SprintCountdown.lastDay()
  return SprintCountdown.ended({ days: -days })
}

export const sprintEnded = (
  sprint: Pick<Group, "completedAt" | "startsAt" | "endsAt">,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
) =>
  sprintState(sprint, now) === "active" &&
  SprintCountdown.$is("ended")(sprintCountdown(sprint, now))

export type StartPreset = Readonly<{
  key: "now" | "tomorrow" | "afterActive" | "monday" | "mondayAfter"
  date: Date
}>

const dayKey = (date: Date) =>
  DateTime.formatIsoDate(
    DateTime.setZone(DateTime.makeUnsafe(date), DateTime.zoneMakeLocal())
  )

export const startPresets = ({
  now = DateTime.nowUnsafe(),
  activeEnd = null
}: Readonly<{
  now?: DateTime.Utc
  activeEnd?: Date | null
}> = {}) => {
  const today = localToday(now)
  const untilMonday = (8 - DateTime.getPart(today, "weekDay")) % 7 || 7
  const at = (days: number) => DateTime.toDateUtc(DateTime.add(today, { days }))
  const nowDate = DateTime.toDate(now)
  const candidates: ReadonlyArray<StartPreset> = [
    { key: "now", date: nowDate },
    { key: "tomorrow", date: at(1) },
    ...(activeEnd !== null && addDays(activeEnd, 1) > nowDate
      ? [{ key: "afterActive" as const, date: addDays(activeEnd, 1) }]
      : []),
    { key: "monday", date: at(untilMonday) },
    { key: "mondayAfter", date: at(untilMonday + 7) }
  ]
  const seen = new Set<string>()
  return candidates
    .filter((preset) => {
      const key = dayKey(preset.date)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .toSorted((a, b) => a.date.getTime() - b.date.getTime())
}
