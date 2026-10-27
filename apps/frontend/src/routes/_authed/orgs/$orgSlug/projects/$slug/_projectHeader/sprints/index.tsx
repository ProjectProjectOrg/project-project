import { createFileRoute, redirect } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Registry from "effect/reactivity/AtomRegistry"

import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { boardRequest, sprintBoard } from "@/features/sprints/atoms/sprintBoard"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintsIndex } from "@/features/sprints/components/SprintsIndex"
import { pickRedirectTarget } from "@/features/sprints/lib/sprintTargets"

export const Route = createFileRoute(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/"
)({
  component: SprintsIndex,
  loader: async ({
    context: { registry },
    params: { orgSlug, slug },
    abortController
  }) => {
    const req = sprintListRequest(orgSlug, slug)
    const result = await Effect.runPromiseExit(
      Registry.getResult(registry, sprintList(req)),
      {
        signal: abortController.signal
      }
    )
    if (Exit.isFailure(result)) return
    const target = pickRedirectTarget(result.value)
    if (!target) return
    registry.mount(sprintDetail(sprintRequest(orgSlug, slug, target.id)))()
    registry.mount(statusesFor(statusesRequest(orgSlug, slug)))()
    registry.mount(sprintBoard(boardRequest(orgSlug, slug, target.id)))()
    throw redirect({
      to: "/orgs/$orgSlug/projects/$slug/sprints/$groupId",
      params: { orgSlug, slug, groupId: target.id },
      search: {},
      replace: true
    })
  }
})
