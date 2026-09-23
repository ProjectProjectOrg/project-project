import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  pickActiveSprint,
  pickEarliestPlannedSprint,
  type Group
} from "@pp/shared"
import { Navigate, createFileRoute, redirect } from "@tanstack/react-router"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"

import { ErrorPage } from "@/components/ErrorPage"
import { PageContainer } from "@/components/page"
import { SprintDetailSkeleton } from "@/components/sprints/SprintDetailSkeleton"
import { SprintsEmpty } from "@/components/sprints/SprintsEmpty"
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

function pickRedirectTarget(sprints: ReadonlyArray<Group>): Group | null {
  const active = pickActiveSprint(sprints)
  if (active) return active
  const planned = pickEarliestPlannedSprint(sprints)
  if (planned) return planned
  const completed = sprints
    .filter((s) => s.completedAt !== null)
    .sort(
      (a, b) =>
        (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0)
    )
  return completed[0] ?? null
}

function SprintsIndex() {
  const { orgSlug, slug } = Route.useParams()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))

  const refresh = useAtomRefresh(sprintList(req))

  return Result.matchWithError(list, {
    onInitial: () => (
      <PageContainer>
        <SprintDetailSkeleton />
      </PageContainer>
    ),
    onError: (error) => <ErrorPage error={error} reset={refresh} contained />,
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refresh} contained />
    ),
    onSuccess: ({ value }) => {
      const target = pickRedirectTarget(value)
      return target ? (
        <Navigate
          to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
          params={{ orgSlug, slug, groupId: target.id }}
          replace
        />
      ) : (
        <PageContainer>
          <SprintsEmpty />
        </PageContainer>
      )
    }
  })
}
