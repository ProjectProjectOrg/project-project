import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { motion } from "motion/react"
import { useCallback, useMemo } from "react"
import type { Ticket, TicketListQuery } from "@projectproject/shared"
import { TicketList } from "@/components/TicketList"
import { BacklogBoard } from "@/components/TicketList/BacklogBoard"
import { BacklogTicketCreator } from "@/components/TicketList/BacklogTicketCreator"
import { BacklogToolbar } from "@/components/TicketList/toolbars"
import { TicketRowActions } from "@/components/TicketList/RowActions"
import { PageContainer } from "@/components/page"
import { ReorderBoardBanner } from "@/components/sprints/ReorderBoardBanner"
import { useStatusReorder } from "@/components/sprints/useStatusReorder"
import { transitions } from "@/lib/springs"
import { me } from "@/atoms/auth"
import { sprintListRequest, sprintMembership } from "@/atoms/sprintList"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import * as Schema from "effect/Schema"
import { BacklogGroupingControl } from "./BacklogGroupingControl"
import { SprintSections } from "./SprintSections"

const GroupingSchema = Schema.Literals(["status", "sprint"])

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
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : ""
  const preferencesKey = `${viewerId}:${orgSlug}/${slug}`
  const [grouping, setGrouping] = useLocalStorageState(
    `projectproject:backlog-grouping:${preferencesKey}`,
    GroupingSchema,
    "status"
  )
  const sprintReq = useMemo(
    () => sprintListRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const membershipResult = useAtomValue(sprintMembership(sprintReq))
  const membership = Result.isSuccess(membershipResult)
    ? membershipResult.value
    : undefined
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

  const toolbar = (
    <BacklogToolbar
      onQueryChange={onQueryChange}
      orgSlug={orgSlug}
      slug={slug}
      query={query}
      members={project.members}
    >
      {!isBoard && (
        <BacklogGroupingControl value={grouping} onChange={setGrouping} />
      )}
    </BacklogToolbar>
  )

  return (
    <PageContainer>
      <TicketList
        orgSlug={orgSlug}
        slug={slug}
        query={query}
        members={project.members}
        sprintMembership={membership}
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
        sections={
          !isBoard && grouping === "sprint" ? (
            <SprintSections
              key={preferencesKey}
              preferencesKey={preferencesKey}
              orgSlug={orgSlug}
              slug={slug}
              query={query}
              members={project.members}
              extraRowActions={rowActions}
            />
          ) : undefined
        }
      />
    </PageContainer>
  )
}
