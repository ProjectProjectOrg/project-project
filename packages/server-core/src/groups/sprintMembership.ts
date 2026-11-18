import type { Group, GroupId } from "@pp/shared"

export type SprintFiles = ReadonlyMap<
  string,
  Pick<Group, "id" | "kind" | "completedAt">
>

export const openSprintOf = (
  sprints: SprintFiles,
  sprint: GroupId | undefined
) =>
  sprint !== undefined && sprints.get(sprint)?.completedAt === null
    ? sprint
    : null
