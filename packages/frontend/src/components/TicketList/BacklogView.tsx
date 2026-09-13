import { useAtomValue } from "@effect/atom-react"
import { motion } from "motion/react"
import { useCallback } from "react"
import type { Ticket, TicketListQuery } from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { BacklogBoard } from "@/components/TicketList/BacklogBoard"
import { BacklogTicketCreator } from "@/components/TicketList/BacklogTicketCreator"
import { BacklogToolbar } from "@/components/TicketList/toolbars"
import { ArchiveTicketControl } from "@/components/TicketList/ArchiveControl"
import { PageContainer } from "@/components/page"
import { ReorderBoardBanner } from "@/components/sprints/ReorderBoardBanner"
import { useStatusReorder } from "@/components/sprints/useStatusReorder"
import { transitions } from "@/lib/springs"
import { projectKey, sprintMembershipAtom } from "@/atoms/sprints"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

export function BacklogView({
  orgSlug,
  slug,
  view,
  query,
  onQueryChange
}: {
  orgSlug: string
  slug: string
  view: "list" | "board"
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
}) {
  const project = useProject()
  const sprintMembership = useAtomValue(
    sprintMembershipAtom(projectKey(orgSlug, slug))
  )
  const {
    reorderMode,
    dragOrder,
    enterReorder,
    cancelReorder,
    setDragOrder,
    saveReorder
  } = useStatusReorder(orgSlug, slug, `${orgSlug}/${slug}/${view}`)
  const rowActions = useCallback(
    (ticket: Ticket) => (
      <ArchiveTicketControl
        orgSlug={orgSlug}
        slug={slug}
        id={ticket.id}
        archived={ticket.archivedAt !== null}
      />
    ),
    [orgSlug, slug]
  )
  const isBoard = view === "board"

  const toolbar = (
    <BacklogToolbar
      onQueryChange={onQueryChange}
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={project.members}
    />
  )

  return (
    <PageContainer>
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        members={project.members}
        sprintMembership={isBoard ? undefined : sprintMembership}
        creator={
          isBoard ? (
            <div className="relative">
              <motion.div
                initial={false}
                animate={{ opacity: reorderMode ? 1 : 0 }}
                transition={transitions.fade}
                inert={!reorderMode}
                aria-hidden={!reorderMode}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2"
              >
                <ReorderBoardBanner
                  onSave={saveReorder}
                  onCancel={cancelReorder}
                />
              </motion.div>
              <motion.div
                initial={false}
                animate={{ opacity: reorderMode ? 0 : 1 }}
                transition={transitions.fade}
                inert={reorderMode}
                aria-hidden={reorderMode}
              >
                <BacklogTicketCreator
                  orgSlug={orgSlug}
                  slug={slug}
                  query={query}
                />
              </motion.div>
            </div>
          ) : undefined
        }
        toolbar={
          isBoard ? (
            <motion.div
              initial={false}
              animate={{ opacity: reorderMode ? 0.35 : 1 }}
              transition={transitions.fade}
              inert={reorderMode}
              aria-hidden={reorderMode}
            >
              {toolbar}
            </motion.div>
          ) : (
            toolbar
          )
        }
        extraRowActions={rowActions}
        renderSnapshot={
          isBoard
            ? ({ key, query: activeQuery, snapshot }) => (
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
              )
            : undefined
        }
      />
    </PageContainer>
  )
}
