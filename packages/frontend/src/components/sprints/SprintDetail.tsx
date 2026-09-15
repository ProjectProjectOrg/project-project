import * as Result from "effect/unstable/reactivity/AsyncResult"
import { RegistryContext, useAtomValue } from "@effect/atom-react"
import * as Effect from "effect/Effect"
import * as Registry from "effect/unstable/reactivity/AtomRegistry"
import { generateKeyBetween } from "fractional-indexing"
import { motion } from "motion/react"
import { useCallback, useContext, useMemo, useState } from "react"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import {
  reorderStatus,
  statusesFor,
  statusesRequest
} from "@/atoms/projectStatuses"
import { sprintDetail, sprintRequest } from "@/atoms/sprintDetail"
import { SprintTicketCreator } from "@/components/TicketList/SprintTicketCreator"
import { ErrorPage } from "@/components/ErrorPage"
import { NotFoundPage } from "@/components/NotFoundPage"
import { PageContainer } from "@/components/page"
import {
  type GroupId,
  type OrderKey,
  type StatusSlug,
  type TicketListQuery
} from "@projectproject/shared"
import { ReorderBoardBanner } from "./ReorderBoardBanner"
import { SprintBoard } from "./SprintBoard"
import { SprintDescription } from "./SprintDescription"
import { SprintDetailSkeleton } from "./SprintDetailSkeleton"
import { SprintTicketList } from "./SprintTicketList"
import { SprintBoardToolbar } from "./SprintBoardToolbar"

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
  const registry = useContext(RegistryContext)
  const req = useMemo(
    () => sprintRequest(orgSlug, slug, groupId),
    [orgSlug, slug, groupId]
  )
  const sprint = useAtomValue(sprintDetail(req))
  const reorderKey = `${orgSlug}/${slug}/${groupId}/${view}`
  const [reorder, setReorder] = useState<{
    key: string
    order: ReadonlyArray<string> | null
  } | null>(null)
  if (reorder !== null && reorder.key !== reorderKey) setReorder(null)
  const reorderMode = reorder !== null
  const dragOrder = reorder?.order ?? null

  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statusesResult = useAtomValue(statusesFor(statusReq))

  const enterReorder = useCallback(
    () => setReorder({ key: reorderKey, order: null }),
    [reorderKey]
  )

  const cancelReorder = useCallback(() => setReorder(null), [])

  const setDragOrder = useCallback(
    (next: ReadonlyArray<string> | null) =>
      setReorder({ key: reorderKey, order: next }),
    [reorderKey]
  )

  const saveReorder = useCallback(() => {
    if (!Result.isSuccess(statusesResult)) return
    const statuses = statusesResult.value
    if (dragOrder && statuses.length > 0) {
      const keys = new Map<string, string>(
        statuses.map((s) => [s.slug as string, s.orderKey as string])
      )
      let lastKey: string | null = null
      for (let i = 0; i < dragOrder.length; i++) {
        const slug = dragOrder[i]
        const myKey = keys.get(slug)
        if (!myKey) continue
        if (lastKey === null || myKey > lastKey) {
          lastKey = myKey
          continue
        }
        let nextValid: string | null = null
        for (let j = i + 1; j < dragOrder.length; j++) {
          const k = keys.get(dragOrder[j])
          if (k && k > lastKey) {
            nextValid = k
            break
          }
        }
        const newKey = generateKeyBetween(lastKey, nextValid)
        keys.set(slug, newKey)
        const mutation = reorderStatus({
          req: statusReq,
          statusSlug: slug as StatusSlug
        })
        const unmount = registry.mount(mutation)
        registry.set(mutation, { orderKey: newKey as OrderKey })
        void Effect.runPromiseExit(
          Registry.getResult(registry, mutation, { suspendOnWaiting: true })
        ).finally(unmount)
        lastKey = newKey
      }
    }
    setReorder(null)
  }, [dragOrder, registry, statusReq, statusesResult])

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
