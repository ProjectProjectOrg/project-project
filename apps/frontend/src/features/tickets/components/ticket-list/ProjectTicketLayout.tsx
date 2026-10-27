import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import type { GroupId, TicketListQuery } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import * as Schema from "effect/Schema"
import { motion } from "motion/react"
import { Activity, type ReactNode } from "react"

import { ErrorPage } from "@/components/shell/ErrorPage"
import { PageContainer } from "@/components/shell/Page"
import { currentUserId } from "@/features/auth/atoms/auth"
import {
  useProject,
  useProjectRoute
} from "@/features/projects/hooks/useProject"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { ReorderBoardBanner } from "@/features/sprints/components/ReorderBoardBanner"
import {
  useStatusReorder,
  type StatusReorder
} from "@/features/sprints/hooks/useStatusReorder"
import { viewCounts } from "@/features/tickets/atoms/viewCounts"
import {
  readLocalStorage,
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { useProjectActor } from "@/lib/access"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"

import { BacklogGroupingControl } from "./BacklogGroupingControl"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SprintTicketCreator } from "./SprintTicketCreator"
import { CreatorActiveScope, DimWhileCreating } from "./TicketCreatorShell"
import {
  TicketToolbar,
  useViewTicketCounts,
  type FilterDimension
} from "./toolbar"
import { ViewSwitcher } from "./ViewSwitcher"

const GroupingSchema = Schema.Literals(["status", "sprint", "epic"])
const groupingCodec = createLocalStorageCodec(GroupingSchema)

const backlogGroupingKey = (preferencesKey: string) =>
  `projectproject:backlog-grouping:${preferencesKey}`

export const readBacklogGrouping = (
  viewerId: string,
  orgSlug: string,
  slug: string
) =>
  readLocalStorage(
    backlogGroupingKey(`${viewerId}:${orgSlug}/${slug}`),
    groupingCodec,
    "status"
  )

type TicketLayoutState = Readonly<{
  grouping: typeof GroupingSchema.Type
  preferencesKey: string
  reorder: StatusReorder
}>

export function ProjectTicketLayout({
  groupId,
  view,
  query,
  onQueryChange,
  children
}: Readonly<{
  groupId: GroupId | null
  view: "list" | "board" | "description"
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  children: (state: TicketLayoutState) => ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const project = useProject()
  const actor = useProjectActor()
  const canCreate = actor.call("tickets", "quickCreate")
  const canAddToSprint = GroupPolicy.can(actor, "sprint", "add_ticket")
  const showCreator = groupId ? canAddToSprint : canCreate
  const viewerId = useAtomValue(currentUserId)
  const preferencesKey = `${viewerId ?? ""}:${orgSlug}/${slug}`
  const [grouping, setGrouping] = useLocalStorageState(
    backlogGroupingKey(preferencesKey),
    groupingCodec,
    "status"
  )
  const scope = groupId ?? "backlog"
  const reorder = useStatusReorder(
    orgSlug,
    slug,
    `${orgSlug}/${slug}/${scope}/${view}`
  )
  const isBoard = view === "board"
  const filters: ReadonlyArray<FilterDimension> = groupId
    ? isBoard
      ? ["type", "assignee", "tags"]
      : ["archived", "type", "assignee", "tags"]
    : ["archived", "type", "assignee", "sprint", "tags"]
  const countsSource = {
    orgSlug,
    slug,
    groupId,
    view,
    grouping,
    query
  } as const
  const counts = useViewTicketCounts(countsSource)
  const refreshCounts = useAtomRefresh(viewCounts(countsSource))
  const countError = Result.matchWithError(counts, {
    onInitial: () => null,
    onError: (error) => ({ error }),
    onDefect: (error) => ({ error }),
    onSuccess: () => null
  })
  return (
    <CreatorActiveScope>
      <PageContainer className="group/list gap-3">
        <Activity mode={view === "description" ? "hidden" : "visible"}>
          {(showCreator || reorder.reorderMode) && (
            <div className="relative min-h-9">
              <motion.div
                initial={false}
                animate={{ opacity: reorder.reorderMode ? 1 : 0 }}
                transition={transitions.fade}
                inert={!reorder.reorderMode}
                aria-hidden={!reorder.reorderMode}
                className="absolute inset-x-0 top-1/2 -translate-y-1/2"
              >
                <ReorderBoardBanner
                  onSave={reorder.saveReorder}
                  onCancel={reorder.cancelReorder}
                />
              </motion.div>
              <motion.div
                initial={false}
                animate={{ opacity: reorder.reorderMode ? 0 : 1 }}
                transition={transitions.fade}
                inert={reorder.reorderMode}
                aria-hidden={reorder.reorderMode}
              >
                {groupId
                  ? canAddToSprint && (
                      <SprintCreator key={groupId} groupId={groupId} />
                    )
                  : canCreate && <BacklogTicketCreator query={query} />}
              </motion.div>
            </div>
          )}
        </Activity>
        <DimWhileCreating className="flex flex-col gap-3 transition-opacity duration-200 ease-out">
          <Activity mode={view === "description" ? "hidden" : "visible"}>
            <motion.div
              initial={false}
              animate={{ opacity: reorder.reorderMode ? 0.35 : 1 }}
              transition={transitions.fade}
              inert={reorder.reorderMode}
              aria-hidden={reorder.reorderMode}
            >
              <TicketToolbar
                scopeKey={scope}
                query={query}
                onQueryChange={onQueryChange}
                members={project.members}
                counts={Result.isSuccess(counts) ? counts.value : null}
                filters={
                  project.estimation === "off"
                    ? filters
                    : [...filters, "estimate"]
                }
                estimation={project.estimation}
                showSort={!groupId || !isBoard}
                viewControls={<ViewSwitcher />}
              >
                {!groupId && !isBoard && (
                  <BacklogGroupingControl
                    value={grouping}
                    onChange={setGrouping}
                  />
                )}
              </TicketToolbar>
              {groupId && isBoard && countError && (
                <ErrorPage
                  error={countError.error}
                  reset={refreshCounts}
                  contained
                />
              )}
            </motion.div>
          </Activity>
          {children({ grouping, preferencesKey, reorder })}
        </DimWhileCreating>
      </PageContainer>
    </CreatorActiveScope>
  )
}

function SprintCreator({ groupId }: Readonly<{ groupId: GroupId }>) {
  const { orgSlug, slug } = useProjectRoute()
  const result = useAtomValue(
    sprintDetail(sprintRequest(orgSlug, slug, groupId))
  )
  return Result.matchWithError(result, {
    onInitial: () => (
      <div className="h-9 animate-pulse rounded-xl bg-muted/40" />
    ),
    onError: () => null,
    onDefect: () => null,
    onSuccess: ({ value }) =>
      value.completedAt !== null ? (
        <p className="flex min-h-9 items-center px-3 py-2 text-xs text-muted-foreground">
          {m.sprints_completed_closed_notice()}
        </p>
      ) : (
        <SprintTicketCreator
          groupId={groupId}
          excludeIds={new Set(value.tickets)}
        />
      )
  })
}
