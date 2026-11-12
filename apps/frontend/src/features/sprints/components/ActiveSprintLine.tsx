import { useAtomValue } from "@effect/atom-react"
import { pickActiveSprint, pickEarliestPlannedSprint } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { sprintElapsed } from "@/features/sprints/lib/sprintDates"

import { SprintStateIcon, sprintStatusText } from "./SprintChip"

export function ActiveSprintLine() {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const sprints = Result.isSuccess(list) ? list.value : []
  const now = DateTime.toDate(DateTime.nowUnsafe())
  const active = pickActiveSprint(sprints, now)
  const sprint = active ?? pickEarliestPlannedSprint(sprints, now)
  const elapsed = active ? sprintElapsed(active, now) : null
  const status = sprint ? sprintStatusText(sprint, now) : null

  return (
    <div className="flex min-w-0 items-center gap-2.5 text-caption whitespace-nowrap text-muted-foreground">
      {sprint && (
        <>
          <Link
            to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
            params={{ orgSlug, slug, groupId: sprint.id }}
            className="-mx-1 inline-flex min-w-0 items-center gap-2.5 rounded px-1 transition-colors hover:bg-hover hover:text-foreground"
          >
            <span className="inline-flex min-w-0 items-center gap-1.5 text-foreground">
              <SprintStateIcon sprint={sprint} now={now} size="xs" />
              <span className="truncate">{sprint.name}</span>
            </span>
            {elapsed !== null && (
              <span className="h-1 w-16 shrink-0 overflow-hidden rounded-full bg-muted">
                <span
                  className="block h-full rounded-full bg-state-info"
                  style={{ width: `${Math.round(elapsed * 100)}%` }}
                />
              </span>
            )}
            {status && <span>{status}</span>}
          </Link>
          <span
            aria-hidden
            className="size-0.5 shrink-0 rounded-full bg-current opacity-60"
          />
        </>
      )}
      <span className="font-mono">/{slug}</span>
    </div>
  )
}
