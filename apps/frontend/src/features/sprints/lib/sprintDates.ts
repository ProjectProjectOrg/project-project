import type { Group } from "@pp/shared"

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
