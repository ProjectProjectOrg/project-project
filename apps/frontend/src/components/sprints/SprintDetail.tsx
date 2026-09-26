import { useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { type GroupId, type TicketListQuery } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useMemo } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { useProjectActor, useProjectCan } from "@/lib/access"
import { m } from "@/paraglide/messages"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

import { SprintBoard } from "./SprintBoard"
import { SprintDescription } from "./SprintDescription"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
import { SprintTicketList } from "./SprintTicketList"
import { ignoreReorder, type StatusReorder } from "./useStatusReorder"

export function SprintDetail({
  orgSlug,
  slug,
  groupId,
  view,
  listQuery,
  reorder
}: Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId
  view: "list" | "board" | "description"
  listQuery: TicketListQuery
  reorder: StatusReorder
}>) {
  const project = useProject()
  const canPlan = GroupPolicy.can(useProjectActor(), "sprint", "manage")
  const canReorder = useProjectCan()("statuses", "reorder")
  const req = useMemo(
    () => sprintRequest(orgSlug, slug, groupId),
    [orgSlug, slug, groupId]
  )
  const sprint = useAtomValue(sprintDetail(req))
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder

  const isBoard = view === "board"
  const isDescription = view === "description"

  return Result.matchWithError(sprint, {
    onInitial: () => <SprintDetailSkeleton />,
    onError: (error) =>
      error._tag === "NotFound" ? (
        <NotFoundPage
          contained
          title={m.sprints_not_found_title()}
          body={m.sprints_not_found_body()}
        />
      ) : (
        <ErrorPage
          contained
          error={error}
          title={m.sprints_load_error_title()}
          body={m.sprints_load_error_body()}
        />
      ),
    onDefect: (defect) => (
      <ErrorPage
        contained
        error={defect}
        title={m.sprints_load_error_title()}
        body={m.sprints_load_error_body()}
      />
    ),
    onSuccess: ({ value }) => {
      const isCompleted = value.completedAt !== null
      return isDescription ? (
        <SprintDescription
          orgSlug={orgSlug}
          slug={slug}
          sprint={value}
          disabled={isCompleted || !canPlan}
        />
      ) : isBoard ? (
        <SprintBoard
          orgSlug={orgSlug}
          slug={slug}
          groupId={value.id}
          query={listQuery}
          members={project.members}
          isCompleted={isCompleted}
          reorderMode={reorderMode}
          onEnterReorder={canReorder ? enterReorder : ignoreReorder}
          onExitReorder={cancelReorder}
          dragOrder={dragOrder}
          setDragOrder={setDragOrder}
        />
      ) : (
        <SprintTicketList
          orgSlug={orgSlug}
          slug={slug}
          query={listQuery}
          members={project.members}
        />
      )
    }
  })
}
