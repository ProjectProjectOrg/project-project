import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue } from "@effect/atom-react"
import { motion } from "motion/react"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import {
  projectKey,
  sprintAtom,
  sprintKey,
  sprintsListAtom
} from "@/atoms/sprints"
import { SprintTicketCreator } from "@/components/TicketList/SprintTicketCreator"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { PageContainer } from "@/components/page"
import {
  type GroupId,
  type TicketId,
  type TicketListQuery
} from "@projectproject/shared"
import { ReorderBoardBanner } from "./ReorderBoardBanner"
import { SprintBoard } from "./SprintBoard"
import { SprintDescription } from "./SprintDescription"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
import { SprintTicketList } from "./SprintTicketList"
import { SprintBoardToolbar } from "./SprintBoardToolbar"
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
  const sprint = useAtomValue(sprintAtom(sprintKey(orgSlug, slug, groupId)))
  const list = useAtomValue(sprintsListAtom(projectKey(orgSlug, slug)))
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
      const allSprints = Result.isSuccess(list) ? list.value : []
      const fromList = allSprints.find((s) => s.id === value.id)
      const display = fromList
        ? {
            ...value,
            name: fromList.name,
            color: fromList.color,
            startsAt: fromList.startsAt,
            endsAt: fromList.endsAt,
            completedAt: fromList.completedAt,
            updatedAt: fromList.updatedAt,
            tickets: fromList.tickets
          }
        : value
      const isCompleted = display.completedAt !== null
      const ticketIds = display.tickets as ReadonlyArray<TicketId>
      const filterIds = new Set(ticketIds)

      const creator = isCompleted ? (
        <p className="px-3 py-2 text-xs text-muted-foreground">
          {m.sprints_completed_closed_notice()}
        </p>
      ) : (
        <SprintTicketCreator
          orgSlug={orgSlug}
          slug={slug}
          groupId={display.id}
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
            sprint={display}
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
                groupId={display.id}
                ticketIds={ticketIds}
                query={listQuery}
                members={project.members}
              />
            </motion.div>
            <SprintBoard
              orgSlug={orgSlug}
              slug={slug}
              groupId={display.id}
              ticketIds={ticketIds}
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
