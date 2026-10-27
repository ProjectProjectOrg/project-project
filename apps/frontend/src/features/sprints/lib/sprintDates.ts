import type { Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"

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

export const defaultSprintRange = (
  now: DateTime.Utc = DateTime.nowUnsafe()
): SprintDateDraft => ({
  from: DateTime.toDate(now),
  to: DateTime.toDate(DateTime.add(now, { days: 14 }))
})
