import { useAtomValue } from "@effect/atom-react"
import { type GroupId, type TicketListQuery } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { motion } from "motion/react"
import { useMemo } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { PageContainer } from "@/components/page"
import { SprintTicketCreator } from "@/components/TicketList/SprintTicketCreator"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

import { ReorderBoardBanner } from "./ReorderBoardBanner"
import { SprintBoard } from "./SprintBoard"
import { SprintBoardToolbar } from "./SprintBoardToolbar"
import { SprintDescription } from "./SprintDescription"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
import { SprintTicketList } from "./SprintTicketList"
import { useStatusReorder } from "./useStatusReorder"

export function SprintDetail({
  orgSlug,
  slug,
  groupId,
  view,
  listQuery,
  onQueryChange
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  view: "list" | "board" | "description"
  listQuery: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
}) {
  const project = useProject()
  const req = useMemo(
    () => sprintRequest(orgSlug, slug, groupId),
    [orgSlug, slug, groupId]
  )
  const sprint = useAtomValue(sprintDetail(req))
  const {
    reorderMode,
    dragOrder,
    enterReorder,
    cancelReorder,
    setDragOrder,
    saveReorder
  } = useStatusReorder(orgSlug, slug, `${orgSlug}/${slug}/${groupId}/${view}`)

  const isBoard = view === "board"
  const isDescription = view === "description"

  return Result.matchWithError(sprint, {
    onInitial: () => (
      <PageContainer>
        <SprintDetailSkeleton />
      </PageContainer>
    ),
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
      const ticketIds = value.tickets
      const filterIds = new Set(ticketIds)

      const creator = isCompleted ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {m.sprints_completed_closed_notice()}
        </p>
      ) : (
        <SprintTicketCreator
          orgSlug={orgSlug}
          slug={slug}
          groupId={value.id}
          excludeIds={filterIds}
        />
      )

      const boardSlot = (
        <div className="relative">
          <motion.div
            initial={false}
            animate={{ opacity: reorderMode ? 1 : 0 }}
            transition={transitions.fade}
            inert={!reorderMode}
            aria-hidden={!reorderMode}
            className="absolute inset-x-0 top-1/2 -translate-y-1/2"
          >
            <ReorderBoardBanner onSave={saveReorder} onCancel={cancelReorder} />
          </motion.div>
          <motion.div
            initial={false}
            animate={{ opacity: reorderMode ? 0 : 1 }}
            transition={transitions.fade}
            inert={reorderMode}
            aria-hidden={reorderMode}
          >
            {creator}
          </motion.div>
        </div>
      )

      const body = isDescription ? (
        <PageContainer>
          <SprintDescription
            orgSlug={orgSlug}
            slug={slug}
            sprint={value}
            disabled={isCompleted}
          />
        </PageContainer>
      ) : isBoard ? (
        <PageContainer className="group/list gap-3">
          {boardSlot}
          <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
            <motion.div
              initial={false}
              animate={{ opacity: reorderMode ? 0.35 : 1 }}
              transition={transitions.fade}
              inert={reorderMode}
              aria-hidden={reorderMode}
            >
              <SprintBoardToolbar
                onQueryChange={onQueryChange}
                orgSlug={orgSlug}
                slug={slug}
                groupId={value.id}
                query={listQuery}
                members={project.members}
              />
            </motion.div>
            <SprintBoard
              orgSlug={orgSlug}
              slug={slug}
              groupId={value.id}
              query={listQuery}
              members={project.members}
              isCompleted={isCompleted}
              reorderMode={reorderMode}
              onEnterReorder={enterReorder}
              onExitReorder={cancelReorder}
              dragOrder={dragOrder}
              setDragOrder={setDragOrder}
            />
          </div>
        </PageContainer>
      ) : (
        <PageContainer>
          <SprintTicketList
            onQueryChange={onQueryChange}
            orgSlug={orgSlug}
            slug={slug}
            query={listQuery}
            members={project.members}
            creator={creator}
          />
        </PageContainer>
      )

      return body
    }
  })
}
