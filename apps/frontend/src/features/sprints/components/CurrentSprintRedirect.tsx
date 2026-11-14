import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { pickActiveSprint } from "@pp/shared"
import { Navigate } from "@tanstack/react-router"

import { AsyncView } from "@/components/shell/AsyncView"
import { PageContainer } from "@/components/shell/Page"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  sprintList,
  sprintListRequest
} from "@/features/sprints/atoms/sprintList"

import { SprintDetailSkeleton } from "./SprintDetailSkeleton"

export function CurrentSprintRedirect() {
  const { orgSlug, slug } = useProjectRoute()
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
        const active = pickActiveSprint(value)
        return active ? (
          <Navigate
            to="/orgs/$orgSlug/projects/$slug/sprints/$groupId"
            params={{ orgSlug, slug, groupId: active.id }}
            replace
          />
        ) : (
          <Navigate
            to="/orgs/$orgSlug/projects/$slug/sprints"
            params={{ orgSlug, slug }}
            replace
          />
        )
      }}
    />
  )
}
