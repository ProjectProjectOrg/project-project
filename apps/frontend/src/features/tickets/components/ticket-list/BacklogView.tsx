import { useAtomValue } from "@effect/atom-react"
import type { Ticket, TicketListQuery } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useCallback } from "react"

import { useProject } from "@/features/projects/hooks/useProject"
import {
  sprintListRequest,
  sprintMembership
} from "@/features/sprints/atoms/sprintList"
import {
  ignoreReorder,
  type StatusReorder
} from "@/features/sprints/hooks/useStatusReorder"
import { TicketListContent } from "@/features/tickets/components/ticket-list"
import { BacklogBoard } from "@/features/tickets/components/ticket-list/BacklogBoard"
import { TicketRowActions } from "@/features/tickets/components/ticket-list/RowActions"
import { useProjectActor } from "@/lib/access"

import { SprintSections } from "./SprintSections"

export function BacklogView({
  orgSlug,
  slug,
  view,
  query,
  grouping,
  preferencesKey,
  reorder
}: Readonly<{
  orgSlug: string
  slug: string
  view: "list" | "board"
  query: TicketListQuery
  grouping: "status" | "sprint"
  preferencesKey: string
  reorder: StatusReorder
}>) {
  const project = useProject()
  const canReorder = useProjectActor().call("statuses", "reorder")
  const sprintReq = sprintListRequest(orgSlug, slug)
  const membershipResult = useAtomValue(sprintMembership(sprintReq))
  const membership = Result.isSuccess(membershipResult)
    ? membershipResult.value
    : undefined
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder
  const rowActions = useCallback(
    (ticket: Ticket) => (
      <TicketRowActions
        orgSlug={orgSlug}
        slug={slug}
        id={ticket.id}
        archived={ticket.archivedAt !== null}
      />
    ),
    [orgSlug, slug]
  )
  const isBoard = view === "board"
  return (
    <TicketListContent
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={project.members}
      sprintMembership={membership}
      extraRowActions={rowActions}
      showAlternate={isBoard}
      alternate={({ key, query: activeQuery, snapshot }) => (
        <BacklogBoard
          key={key}
          orgSlug={orgSlug}
          slug={slug}
          query={activeQuery}
          members={project.members}
          snapshot={snapshot}
          reorderMode={reorderMode}
          onEnterReorder={canReorder ? enterReorder : ignoreReorder}
          onExitReorder={cancelReorder}
          dragOrder={dragOrder}
          setDragOrder={setDragOrder}
        />
      )}
      showSections={!isBoard && grouping === "sprint"}
      sections={
        <SprintSections
          key={preferencesKey}
          preferencesKey={preferencesKey}
          orgSlug={orgSlug}
          slug={slug}
          query={query}
          members={project.members}
          extraRowActions={rowActions}
        />
      }
    />
  )
}
