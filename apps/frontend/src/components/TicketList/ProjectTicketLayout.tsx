import { useAtomValue } from "@effect/atom-react"
import type { GroupId, TicketListQuery } from "@pp/shared"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { motion } from "motion/react"
import { Activity, type ReactNode } from "react"

import { PageContainer } from "@/components/page"
import { ReorderBoardBanner } from "@/components/sprints/ReorderBoardBanner"
import {
  useStatusReorder,
  type StatusReorder
} from "@/components/sprints/useStatusReorder"
import { me } from "@/features/auth/atoms/auth"
import {
  sprintDetail,
  sprintRequest
} from "@/features/sprints/atoms/sprintDetail"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import { transitions } from "@/lib/springs"
import { m } from "@/paraglide/messages"
import { useProject } from "@/routes/_authed/orgs/$orgSlug/projects/$slug/-context"

import { BacklogGroupingControl } from "./BacklogGroupingControl"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { SprintTicketCreator } from "./SprintTicketCreator"
import { TicketToolbar, useServerTicketCounts } from "./toolbar"
import { ViewSwitcher } from "./ViewSwitcher"

const GroupingSchema = Schema.Literals(["status", "sprint"])

type TicketLayoutState = Readonly<{
  grouping: typeof GroupingSchema.Type
  preferencesKey: string
  reorder: StatusReorder
}>

export function ProjectTicketLayout({
  orgSlug,
  slug,
  groupId,
  view,
  query,
  onQueryChange,
  children
}: Readonly<{
  orgSlug: string
  slug: string
  groupId: GroupId | null
  view: "list" | "board" | "description"
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  children: (state: TicketLayoutState) => ReactNode
}>) {
  const project = useProject()
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : ""
  const preferencesKey = `${viewerId}:${orgSlug}/${slug}`
  const [grouping, setGrouping] = useLocalStorageState(
    `projectproject:backlog-grouping:${preferencesKey}`,
    GroupingSchema,
    "status"
  )
  const scope = groupId ?? "backlog"
  const reorder = useStatusReorder(
    orgSlug,
    slug,
    `${orgSlug}/${slug}/${scope}/${view}`
  )
  const isBoard = view === "board"
  const counts = useServerTicketCounts(
    orgSlug,
    slug,
    isBoard ? { ...query, archived: undefined } : query
  )
  return (
    <PageContainer className="group/list gap-3">
      <Activity mode={view === "description" ? "hidden" : "visible"}>
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
            {groupId ? (
              <SprintCreator
                key={groupId}
                orgSlug={orgSlug}
                slug={slug}
                groupId={groupId}
              />
            ) : (
              <BacklogTicketCreator
                orgSlug={orgSlug}
                slug={slug}
                query={query}
              />
            )}
          </motion.div>
        </div>
      </Activity>
      <div className="flex flex-col gap-3 transition-opacity duration-200 ease-out group-has-[form[data-active]]/list:opacity-35">
        <Activity mode={view === "description" ? "hidden" : "visible"}>
          <motion.div
            initial={false}
            animate={{ opacity: reorder.reorderMode ? 0.35 : 1 }}
            transition={transitions.fade}
            inert={reorder.reorderMode}
            aria-hidden={reorder.reorderMode}
          >
            <TicketToolbar
              orgSlug={orgSlug}
              slug={slug}
              scopeKey={scope}
              query={query}
              onQueryChange={onQueryChange}
              members={project.members}
              counts={counts}
              filters={
                groupId
                  ? isBoard
                    ? ["type", "assignee", "tags"]
                    : ["archived", "type", "assignee", "tags"]
                  : ["archived", "type", "assignee", "sprint", "tags"]
              }
              showSort={!groupId || !isBoard}
              viewControls={<ViewSwitcher orgSlug={orgSlug} slug={slug} />}
            >
              {!groupId && !isBoard && (
                <BacklogGroupingControl
                  value={grouping}
                  onChange={setGrouping}
                />
              )}
            </TicketToolbar>
          </motion.div>
        </Activity>
        {children({ grouping, preferencesKey, reorder })}
      </div>
    </PageContainer>
  )
}

function SprintCreator({
  orgSlug,
  slug,
  groupId
}: Readonly<{ orgSlug: string; slug: string; groupId: GroupId }>) {
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
          orgSlug={orgSlug}
          slug={slug}
          groupId={groupId}
          excludeIds={new Set(value.tickets)}
        />
      )
  })
}
