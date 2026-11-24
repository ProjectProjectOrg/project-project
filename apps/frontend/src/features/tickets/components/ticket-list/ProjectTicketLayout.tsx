import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { GroupPolicy } from "@pp/access/policies"
import type { GroupId, TicketListQuery } from "@pp/shared"
import type { BacklogGrouping } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
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
import {
  useStatusReorder,
  type StatusReorder
} from "@/features/sprints/hooks/useStatusReorder"
import { encodeTicketListQuery } from "@/features/tickets/atoms/backlog"
import { viewCounts } from "@/features/tickets/atoms/viewCounts"
import {
  groupingCodec,
  DEFAULT_GROUPING,
  backlogGroupingKey
} from "@/features/tickets/lib/backlogGrouping"
import { useProjectActor } from "@/hooks/useActor"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import { m } from "@/paraglide/messages"

import { BacklogGroupingControl } from "./BacklogGroupingControl"
import { BacklogTicketCreator } from "./BacklogTicketCreator"
import { ListDragOverlay } from "./ListDragOverlay"
import { ListKeyboardProvider } from "./ListKeyboard"
import { ScrollFloor } from "./ScrollFloor"
import { SprintTicketCreator } from "./SprintTicketCreator"
import { StickyListBar } from "./StickyListBar"
import { TicketSelectionProvider } from "./TicketSelection"
import {
  TicketToolbar,
  useViewTicketCounts,
  type FilterDimension
} from "./toolbar"
import { ViewFilterCommandScope } from "./ViewFilterCommandScope"
import { ViewSwitcher } from "./ViewSwitcher"

type TicketLayoutState = Readonly<{
  grouping: BacklogGrouping
  preferencesKey: string
  reorder: StatusReorder
}>

export function ProjectTicketLayout({
  groupId,
  view,
  query,
  onQueryChange,
  onQueryPrefetch,
  children
}: Readonly<{
  groupId: GroupId | null
  view: "list" | "board" | "description"
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  onQueryPrefetch: (query: TicketListQuery) => void
  children: (state: TicketLayoutState) => ReactNode
}>) {
  const { orgSlug, slug } = useProjectRoute()
  const project = useProject()
  const actor = useProjectActor()
  const canCreate = actor.call("tickets", "quickCreate")
  const canAddToSprint = GroupPolicy.can(actor, "sprint", "add_ticket")
  const viewerId = useAtomValue(currentUserId)
  const preferencesKey = `${viewerId ?? ""}:${orgSlug}/${slug}`
  const [grouping, setGrouping] = useLocalStorageState(
    backlogGroupingKey(preferencesKey),
    groupingCodec,
    DEFAULT_GROUPING
  )
  const scope = groupId ?? "backlog"
  const reorder = useStatusReorder(
    orgSlug,
    slug,
    `${orgSlug}/${slug}/${scope}/${view}`
  )
  const isBoard = view === "board"
  const scopeFilters: ReadonlyArray<FilterDimension> = groupId
    ? isBoard
      ? ["flagged", "blocked", "type", "assignee", "epic", "tags"]
      : ["flagged", "blocked", "archived", "type", "assignee", "epic", "tags"]
    : [
        "flagged",
        "blocked",
        "archived",
        "type",
        "assignee",
        "sprint",
        "epic",
        "tags"
      ]
  const filterDimensions: ReadonlyArray<FilterDimension> =
    project.estimation === "off" ? scopeFilters : [...scopeFilters, "estimate"]
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
    <>
      <ViewFilterCommandScope
        dimensions={filterDimensions}
        query={query}
        onQueryChange={onQueryChange}
        onQueryPrefetch={onQueryPrefetch}
      />
      <PageContainer className="group/list gap-3">
        <StickyListBar>
          <Activity mode={view === "description" ? "hidden" : "visible"}>
            {groupId
              ? canAddToSprint && (
                  <SprintCreator key={groupId} groupId={groupId} />
                )
              : canCreate && <BacklogTicketCreator query={query} />}
          </Activity>
          <Activity mode={view === "description" ? "hidden" : "visible"}>
            <div>
              <TicketToolbar
                scopeKey={scope}
                query={query}
                onQueryChange={onQueryChange}
                members={project.members}
                counts={Result.isSuccess(counts) ? counts.value : null}
                filters={filterDimensions}
                estimation={project.estimation}
                showSort={!groupId || !isBoard}
                boardScope={
                  isBoard ? (groupId ? "sprints" : "backlog") : undefined
                }
                onResetViewControls={
                  !groupId && !isBoard && grouping !== DEFAULT_GROUPING
                    ? () => setGrouping(DEFAULT_GROUPING)
                    : undefined
                }
                viewControls={
                  <>
                    <ViewSwitcher />
                    {!groupId && !isBoard && (
                      <BacklogGroupingControl
                        value={grouping}
                        onChange={setGrouping}
                      />
                    )}
                  </>
                }
              />
              {groupId && isBoard && countError && (
                <ErrorPage
                  error={countError.error}
                  reset={refreshCounts}
                  contained
                />
              )}
            </div>
          </Activity>
        </StickyListBar>
        <div className="flex flex-col gap-3">
          <TicketSelectionProvider
            resetKey={`${orgSlug}/${slug}:${scope}:${view}:${grouping}:${encodeTicketListQuery(query)}`}
          >
            <ListKeyboardProvider>
              {children({ grouping, preferencesKey, reorder })}
              <ListDragOverlay />
            </ListKeyboardProvider>
          </TicketSelectionProvider>
          <ScrollFloor />
        </div>
      </PageContainer>
    </>
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
        <p className="flex min-h-9 items-center px-3 py-2 text-caption text-muted-foreground">
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
