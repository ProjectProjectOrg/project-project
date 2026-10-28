import type { TicketListQuery } from "@pp/shared"

import { useProject } from "@/features/projects/hooks/useProject"
import {
  ignoreReorder,
  type StatusReorder
} from "@/features/sprints/hooks/useStatusReorder"
import { TicketListContent } from "@/features/tickets/components/ticket-list"
import { BacklogBoard } from "@/features/tickets/components/ticket-list/BacklogBoard"
import { useProjectActor } from "@/lib/access"

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
  grouping: "status" | "sprint" | "epic"
  preferencesKey: string
  reorder: StatusReorder
}>) {
  const project = useProject()
  const canReorder = useProjectActor().call("statuses", "reorder")
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder
  const isBoard = view === "board"
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
      showSections={!isBoard && grouping !== "status"}
      sections={
        grouping === "epic" ? (
          <EpicSections
            key={preferencesKey}
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
