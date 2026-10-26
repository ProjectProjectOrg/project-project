import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { getRouteApi, Navigate } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import { PageContainer } from "@/components/shell/Page"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"
import { SprintDetailSkeleton } from "@/features/sprints/components/SprintDetailSkeleton"
import { SprintsEmpty } from "@/features/sprints/components/SprintsEmpty"
import { pickRedirectTarget } from "@/features/sprints/lib/sprintTargets"

const routeApi = getRouteApi(
  "/_authed/orgs/$orgSlug/projects/$slug/_projectHeader/sprints/"
)

export function SprintsIndex() {
  const { orgSlug, slug } = routeApi.useParams()
  const req = sprintListRequest(orgSlug, slug)
  const list = useAtomValue(sprintList(req))

  const refresh = useAtomRefresh(sprintList(req))

  return (
    <AsyncView
      result={list}
      contained
      reset={refresh}
      onInitial={() => (
        <PageContainer>
          <SprintDetailSkeleton />
        </PageContainer>
      )}
      onSuccess={({ value }) => {
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
      }}
    />
  )
}
