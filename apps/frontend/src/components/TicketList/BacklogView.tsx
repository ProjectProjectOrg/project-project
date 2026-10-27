import type { TicketListQuery } from "@pp/shared"

import type { StatusReorder } from "@/components/sprints/useStatusReorder"
import { TicketListContent } from "@/components/TicketList"
import { BacklogBoard } from "@/components/TicketList/BacklogBoard"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

import { EpicSections } from "./EpicSections"
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
  grouping: "status" | "sprint" | "epic"
  preferencesKey: string
  reorder: StatusReorder
}>) {
  const project = useProject()
  const { reorderMode, dragOrder, enterReorder, cancelReorder, setDragOrder } =
    reorder
  const isBoard = view === "board"
  return (
    <TicketListContent
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={project.members}
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
          onEnterReorder={enterReorder}
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
            orgSlug={orgSlug}
            slug={slug}
            query={query}
            members={project.members}
          />
        ) : (
          <SprintSections
            key={preferencesKey}
            preferencesKey={preferencesKey}
            orgSlug={orgSlug}
            slug={slug}
            query={query}
            members={project.members}
          />
        )
      }
    />
  )
}
