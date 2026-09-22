import type { Group, GroupDetail, UpdateGroupInput } from "@pp/shared"
import * as DateTime from "effect/DateTime"

export function applySprintPatch(
  sprint: Group,
  patch: UpdateGroupInput
): Group {
  return {
    ...sprint,
    name: patch.name ?? sprint.name,
    color: patch.color ?? sprint.color,
    startsAt: patch.startsAt !== undefined ? patch.startsAt : sprint.startsAt,
    endsAt: patch.endsAt !== undefined ? patch.endsAt : sprint.endsAt,
    completedAt:
      patch.completedAt !== undefined ? patch.completedAt : sprint.completedAt,
    updatedAt: DateTime.toDate(DateTime.nowUnsafe())
  }
}

export function applySprintDetailPatch(
  sprint: GroupDetail,
  patch: UpdateGroupInput
): GroupDetail {
  return {
    ...applySprintPatch(sprint, patch),
    body: patch.body ?? sprint.body
  }
}
