import { useAtomValue } from "@effect/atom-react"
import { pickActiveSprint, type Group } from "@pp/shared"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"

import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { sprintStatusText } from "@/features/sprints/components/SprintChip"

type SprintListResult = Atom.Type<ReturnType<typeof sprintList>>

const noProject: Atom.Atom<SprintListResult> = Atom.make(Result.initial())

// Takes no project (null) too, for a caller that always renders, like the
// sidebar header on the dashboard.
export function useActiveSprint(
  orgSlug: string | null,
  slug: string | null
): Readonly<{ sprint: Group; label: string; countdown: string }> | null {
  const result = useAtomValue(
    orgSlug === null || slug === null
      ? noProject
      : sprintList(sprintListRequest(orgSlug, slug))
  )
  if (!Result.isSuccess(result)) return null
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const sprint = pickActiveSprint(result.value, now)
  if (!sprint) return null
  const countdown = sprintStatusText(sprint, now) ?? ""
  return {
    sprint,
    label: countdown ? `${sprint.name} · ${countdown}` : sprint.name,
    countdown
  }
}
