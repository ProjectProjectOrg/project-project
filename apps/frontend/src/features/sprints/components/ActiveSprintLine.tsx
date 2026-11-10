import { useAtomValue } from "@effect/atom-react"
import { pickActiveSprint } from "@pp/shared"
import { Link } from "@tanstack/react-router"
import * as Result from "effect/reactivity/AsyncResult"

import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { sprintCountdown } from "@/features/sprints/lib/sprintDates"
import { m } from "@/paraglide/messages"

import { countdownLabel, SprintStateIcon } from "./SprintChip"

export function ActiveSprintLine() {
  const { orgSlug, slug } = useProjectRoute()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))
  const sprints = Result.isSuccess(list) ? list.value : []
  const active = pickActiveSprint(sprints)

  if (!active) {
    return (
      <p className="font-mono text-caption text-muted-foreground">/{slug}</p>
    )
  }
  const countdown = sprintCountdown(active)
  const summary =
    countdown.kind === "noEnd"
      ? active.name
      : m.project_header_active_sprint_status({
          name: active.name,
          status: countdownLabel(countdown)
        })

  return (
    <Link
      to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
      params={{ orgSlug, slug, groupId: active.id }}
      className="-mx-1 inline-flex w-fit items-center gap-1.5 rounded px-1 text-caption text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
    >
      <SprintStateIcon sprint={active} size="xs" />
      <span className="font-mono">{summary}</span>
    </Link>
  )
}
