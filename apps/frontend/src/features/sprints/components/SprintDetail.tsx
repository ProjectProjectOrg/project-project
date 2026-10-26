import { useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import { type GroupId, type TicketListQuery } from "@pp/shared"
import * as Match from "effect/Match"
import * as Result from "effect/reactivity/AsyncResult"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { NotFoundPage } from "@/components/shell/NotFoundPage"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { useProjectActor } from "@/lib/access"
import { m } from "@/paraglide/messages"

import { ignoreReorder, type StatusReorder } from "../hooks/useStatusReorder"
import { SprintBoard } from "./SprintBoard"
import { SprintDescription } from "./SprintDescription"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
import { SprintTicketList } from "./SprintTicketList"

export function SprintDetail({
  groupId,
  view,
  listQuery,
  reorder
}: Readonly<{
  groupId: GroupId
  view: "list" | "board" | "description"
  listQuery: TicketListQuery
  reorder: StatusReorder
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const project = useProject()
  const actor = useProjectActor()
  const canPlan = GroupPolicy.can(actor, "sprint", "manage")
  const canReorder = actor.call("statuses", "reorder")
  const req = sprintRequest(orgSlug, slug, groupId)
  const sprint = useAtomValue(sprintDetail(req))
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder

  const isBoard = view === "board"
  const isDescription = view === "description"

  return Result.matchWithError(sprint, {
    onInitial: () => <SprintDetailSkeleton />,
    onError: (error) =>
      Match.value(error).pipe(
        Match.tag("NotFound", () => (
          <NotFoundPage
            contained
            title={m.sprints_not_found_title()}
            body={m.sprints_not_found_body()}
          />
        )),
        Match.orElse((error) => (
          <ErrorPage
            contained
            error={error}
            title={m.sprints_load_error_title()}
            body={m.sprints_load_error_body()}
          />
        ))
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
        <SprintDescription sprint={value} disabled={isCompleted || !canPlan} />
      ) : isBoard ? (
        <SprintBoard
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
        <SprintTicketList query={listQuery} members={project.members} />
      )
    }
  })
}
