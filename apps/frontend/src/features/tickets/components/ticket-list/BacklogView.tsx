import { useAtomValue } from "@effect/atom-react"
import type { TicketListQuery } from "@pp/shared"
import type { BacklogGrouping } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useState } from "react"

import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  ignoreReorder,
  type StatusReorder
} from "@/features/sprints/hooks/useStatusReorder"
import { viewCounts } from "@/features/tickets/atoms/viewCounts"
import { TicketListContent } from "@/features/tickets/components/ticket-list"
import { BacklogBoard } from "@/features/tickets/components/ticket-list/BacklogBoard"
import { useProjectActor } from "@/hooks/useActor"

import { EpicSections } from "./EpicSections"
import { SprintSections } from "./SprintSections"

export function BacklogView({
  view,
  query,
  onQueryChange,
  grouping,
  preferencesKey,
  reorder
}: Readonly<{
  view: "list" | "board"
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  grouping: BacklogGrouping
  preferencesKey: string
  reorder: StatusReorder
}>) {
  const project = useProject()
  const canReorder = useProjectActor().call("statuses", "reorder")
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder
  const shown = useLoadedView(grouping, view, query)
  const isBoard = shown.view === "board"
  return (
    <TicketListContent
      query={query}
      members={project.members}
      showAlternate={isBoard}
      alternate={({ key, query: activeQuery, snapshot }) => (
        <BacklogBoard
          key={key}
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
      showSections={!isBoard && shown.grouping !== "status"}
      sections={
        shown.grouping === "epic" || shown.grouping === "parent" ? (
          <EpicSections
            key={preferencesKey}
            by={shown.grouping}
            preferencesKey={preferencesKey}
            query={query}
            members={project.members}
          />
        ) : (
          <SprintSections
            key={preferencesKey}
            preferencesKey={preferencesKey}
            query={query}
            onQueryChange={onQueryChange}
            members={project.members}
          />
        )
      }
    />
  )
}

function useLoadedView(
  grouping: BacklogGrouping,
  view: "list" | "board",
  query: TicketListQuery
): Readonly<{ grouping: BacklogGrouping; view: "list" | "board" }> {
  const { orgSlug, slug } = useProjectRoute()
  const [shown, setShown] = useState({ grouping, view })
  const target = useAtomValue(
    viewCounts({ orgSlug, slug, groupId: null, view, grouping, query })
  )
  if (
    (shown.grouping !== grouping || shown.view !== view) &&
    !Result.isInitial(target)
  ) {
    setShown({ grouping, view })
  }
  return shown
}
