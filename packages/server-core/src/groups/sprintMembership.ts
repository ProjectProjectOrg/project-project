import type { Group, GroupId } from "@pp/shared"

export type SprintFiles = ReadonlyMap<
  string,
  Pick<Group, "id" | "kind" | "completedAt">
>

export const openSprintOf = (
  sprints: SprintFiles,
  sprint: GroupId | undefined
): GroupId | null =>
  sprint !== undefined && sprints.get(sprint)?.completedAt === null
    ? sprint
    : null

export const sprintAfter = (
  sprints: SprintFiles,
  current: GroupId | undefined,
  requested: GroupId | null
): GroupId | undefined => {
  if (requested !== null) return requested
  if (current === undefined) return undefined
  const completedAt = sprints.get(current)?.completedAt
  return completedAt === null || completedAt === undefined ? undefined : current
}
