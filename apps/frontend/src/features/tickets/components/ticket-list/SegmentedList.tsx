import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { ticketRule, matchesStatusRule } from "@pp/shared"
import type {
  Member,
  ProjectStatus,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { ListChecks } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { boardStatusesFor } from "@/features/sprints/lib/boardUtils"
import {
  backlogRequest,
  backlogTicketUpdates,
  type BacklogValue
} from "@/features/tickets/atoms/backlog"
import type { TicketUpdates } from "@/features/tickets/atoms/ticketRows"
import { hasTicketFilters } from "@/features/tickets/lib/ticketFilters"
import type { TicketRowPage } from "@/features/tickets/lib/ticketRows"
import { m } from "@/paraglide/messages"

import { FilteredEmpty } from "./FilteredEmpty"
import { statusCollapseKey, useCollapsedInSet } from "./sectionCollapse"
import { CreatingSectionsProvider, SectionList } from "./SectionList"
import { useTicketPreview } from "./useTicketPreview"

const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []
const EMPTY_PAGE: TicketRowPage = { items: [], nextCursor: null }

export function SegmentedList({
  query,
  members,
  snapshot,
  empty
}: {
  query: TicketListQuery
  members: ReadonlyArray<Member>
  snapshot: BacklogValue
  empty?: ReactNode
}) {
  const { orgSlug, slug } = useProjectRoute()
  const preview = useTicketPreview()
  const update = backlogTicketUpdates(backlogRequest(orgSlug, slug, query))

  const statusReq = statusesRequest(orgSlug, slug)
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const refreshStatuses = useAtomRefresh(statusesFor(statusReq))
  const statuses: ReadonlyArray<ProjectStatus> = Result.isSuccess(
    statusesResult
  )
    ? statusesResult.value
    : EMPTY_STATUSES

  const { counts, sections } = snapshot
  const byStatus = counts.byStatus
  const hasActiveFilter = hasTicketFilters(query)

  const filteredStatuses: ReadonlyArray<TicketStatus> = useMemo(() => {
    const allOrdered = boardStatusesFor(statuses).filter((status) =>
      matchesStatusRule(query, status)
    )
    if (ticketRule(query, "status") || !hasActiveFilter) return allOrdered
    return allOrdered.filter((status) => (byStatus[status] ?? 0) > 0)
  }, [statuses, query, hasActiveFilter, byStatus])

  const persistKey = statusCollapseKey(orgSlug, slug)

  if (!Result.isSuccess(statusesResult)) {
    return (
      <AsyncView
        result={statusesResult}
        contained
        reset={refreshStatuses}
        onInitial={() => (
          <div
            aria-busy="true"
            className="h-96 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
          />
        )}
        onSuccess={() => null}
      />
    )
  }

  if (counts.total === 0 && !hasActiveFilter) {
    if (empty !== undefined) return empty
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <ListChecks strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{m.tickets_empty_title()}</EmptyTitle>
          <EmptyDescription>
            {m.tickets_empty_hint_prefix()}{" "}
            <span className="font-mono">{m.tickets_empty_hint_folder()}</span>.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    )
  }

  if (filteredStatuses.length === 0 && hasActiveFilter) {
    return <FilteredEmpty query={query} />
  }

  return (
    <div
      key="sections"
      style={{ overflowAnchor: "none" }}
      className="flex flex-col gap-1"
    >
      <CreatingSectionsProvider>
        {filteredStatuses.map((status) => (
          <StatusSection
            key={status}
            persistKey={persistKey}
            searchQuery={query.q}
            status={status}
            statuses={statuses}
            query={query}
            update={update}
            count={byStatus[status] ?? 0}
            page={sections[status] ?? EMPTY_PAGE}
            members={members}
            activePreviewId={preview.activePreviewId}
            onPreviewPointerEnter={preview.onPreviewPointerEnter}
            onPreviewOpenChange={preview.onPreviewOpenChange}
          />
        ))}
      </CreatingSectionsProvider>
    </div>
  )
}

function StatusSection({
  persistKey,
  searchQuery,

  status,
  statuses,
  query,
  update,
  count,
  page,
  members,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: {
  persistKey: string
  searchQuery: string | undefined
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  query: TicketListQuery
  update: TicketUpdates
  count: number
  page: TicketRowPage
  members: ReadonlyArray<Member>
  activePreviewId: TicketId | null
  onPreviewPointerEnter: (ticketId: TicketId) => void
  onPreviewOpenChange: (ticketId: TicketId, open: boolean) => void
}) {
  const [collapsed, toggleCollapsed] = useCollapsedInSet(
    persistKey,
    status,
    searchQuery
  )
  return (
    <SectionList
      status={status}
      statuses={statuses}
      query={query}
      update={update}
      count={count}
      page={page}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      members={members}
      activePreviewId={activePreviewId}
      onPreviewPointerEnter={onPreviewPointerEnter}
      onPreviewOpenChange={onPreviewOpenChange}
    />
  )
}
