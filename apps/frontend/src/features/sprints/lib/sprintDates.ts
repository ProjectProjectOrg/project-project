import { sprintState, type Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"

import { getLocale } from "@/paraglide/runtime"

import { localToday } from "./parseStartDate"

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
): SprintDatesPatch | null => {
  const startsAt = draft.from ?? null
  const endsAt = draft.to ?? null
  return startsAt?.getTime() !== sprint.startsAt?.getTime() ||
    endsAt?.getTime() !== sprint.endsAt?.getTime()
    ? { startsAt, endsAt }
    : null
}

export const formatSprintRange = (from: Date, to: Date): string => {
  const format = new Intl.DateTimeFormat(getLocale(), {
    month: "short",
    day: "numeric"
  })
  return `${format.format(from)} – ${format.format(to)}`
}

export const DEFAULT_SPRINT_DAYS = 14
const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (date: Date) => localToday(DateTime.makeUnsafe(date))

export const startOfDay = (date: Date): Date => DateTime.toDateUtc(dayOf(date))

export const addDays = (date: Date, days: number): Date =>
  DateTime.toDateUtc(DateTime.add(dayOf(date), { days }))

export const daysBetween = (from: Date, to: Date): number =>
  Math.round(
    (DateTime.toEpochMillis(dayOf(to)) - DateTime.toEpochMillis(dayOf(from))) /
      DAY_MS
  )

export const sprintLengthDays = (
  sprint: Pick<Group, "startsAt" | "endsAt">
): number | null =>
  sprint.startsAt === null ||
  sprint.endsAt === null ||
  sprint.endsAt < sprint.startsAt
    ? null
    : daysBetween(sprint.startsAt, sprint.endsAt) + 1

export const defaultSprintRange = (
  now: DateTime.Utc = DateTime.nowUnsafe()
): SprintDateDraft => {
  const from = startOfDay(DateTime.toDate(now))
  return { from, to: addDays(from, DEFAULT_SPRINT_DAYS - 1) }
}

export const startSprintPatch = (
  sprint: Pick<Group, "startsAt" | "endsAt">,
  start: Date
): SprintDatesPatch => {
  const startsAt = startOfDay(start)
  const length = sprintLengthDays(sprint) ?? DEFAULT_SPRINT_DAYS
  return { startsAt, endsAt: addDays(startsAt, length - 1) }
}

export type SprintCountdown =
  | Readonly<{ kind: "noEnd" }>
  | Readonly<{ kind: "left"; days: number }>
  | Readonly<{ kind: "lastDay" }>
  | Readonly<{ kind: "ended"; days: number }>

export const sprintCountdown = (
  sprint: Pick<Group, "endsAt">,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
): SprintCountdown => {
  if (sprint.endsAt === null) return { kind: "noEnd" }
  const days = daysBetween(now, sprint.endsAt)
  if (days > 0) return { kind: "left", days }
  if (days === 0) return { kind: "lastDay" }
  return { kind: "ended", days: -days }
}

export const sprintEnded = (
  sprint: Group,
  now: Date = DateTime.toDate(DateTime.nowUnsafe())
): boolean =>
  sprintState(sprint, now) === "active" &&
  sprintCountdown(sprint, now).kind === "ended"

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
}> = {}): ReadonlyArray<StartPreset> => {
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
