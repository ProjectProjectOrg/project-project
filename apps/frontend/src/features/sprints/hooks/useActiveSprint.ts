import { useAtomValue } from "@effect/atom-react"
import { sprintState, type Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"

import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { sprintStatusText } from "@/features/sprints/components/SprintChip"

export function useActiveSprint(
  orgSlug: string,
  slug: string
): Readonly<{ sprint: Group; label: string; countdown: string }> | null {
  const result = useAtomValue(sprintList(sprintListRequest(orgSlug, slug)))
  if (!Result.isSuccess(result)) return null
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprint = result.value.find((s) => sprintState(s, now) === "active")
  if (!sprint) return null
  const countdown = sprintStatusText(sprint, now) ?? ""
  return {
    sprint,
    label: countdown ? `${sprint.name} · ${countdown}` : sprint.name,
    countdown
  }
}
