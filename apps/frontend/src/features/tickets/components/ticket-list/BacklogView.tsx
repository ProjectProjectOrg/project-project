import { useAtomValue } from "@effect/atom-react"
import type { TicketListQuery } from "@pp/shared"
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
import type { BacklogGrouping } from "@/features/tickets/lib/backlogGrouping"
import { useProjectActor } from "@/hooks/useActor"

import { EpicSections } from "./EpicSections"
import { SprintSections } from "./SprintSections"

export function BacklogView({
  view,
  query,
  grouping,
  preferencesKey,
  reorder
}: Readonly<{
  view: "list" | "board"
  query: TicketListQuery
  grouping: BacklogGrouping
  preferencesKey: string
  reorder: StatusReorder
}>) {
  const project = useProject()
  const canReorder = useProjectActor().call("statuses", "reorder")
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder
  const isBoard = view === "board"
  const shown = useLoadedGrouping(grouping, view, query)
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
      showSections={!isBoard && shown !== "status"}
      sections={
        shown === "epic" || shown === "parent" ? (
          <EpicSections
            key={preferencesKey}
            by={shown}
            preferencesKey={preferencesKey}
            query={query}
            members={project.members}
          />
        ) : (
          <SprintSections
            key={preferencesKey}
            preferencesKey={preferencesKey}
            query={query}
            members={project.members}
          />
        )
      }
    />
  )
}

// Keeps showing the current grouping until the chosen one has loaded, so a
// switch swaps the list in one step instead of collapsing to a placeholder.
function useLoadedGrouping(
  grouping: BacklogGrouping,
  view: "list" | "board",
  query: TicketListQuery
): BacklogGrouping {
  const { orgSlug, slug } = useProjectRoute()
  const [shown, setShown] = useState(grouping)
  const target = useAtomValue(
    viewCounts({ orgSlug, slug, groupId: null, view, grouping, query })
  )
  if (shown !== grouping && !Result.isInitial(target)) setShown(grouping)
  return shown
}
