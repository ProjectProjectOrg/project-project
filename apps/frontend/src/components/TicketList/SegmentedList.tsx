import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import type {
  Group,
  Member,
  ProjectStatus,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import { useNavigate, useRouter } from "@tanstack/react-router"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { FilterX, ListChecks } from "lucide-react"
import { useMemo, type ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import { boardStatusesFor } from "@/components/sprints/board-utils"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@/components/ui/empty"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import type {
  BacklogSection,
  BacklogValue
} from "@/features/tickets/atoms/backlog"
import { m } from "@/paraglide/messages"

import { statusCollapseKey, useCollapsedInSet } from "./sectionCollapse"
import { SectionList } from "./SectionList"
import { useTicketPreview } from "./useTicketPreview"

const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []
const EMPTY_PAGE: BacklogSection = { items: [], nextCursor: null }

export function SegmentedList({
  orgSlug,
  slug,
  query,
  members,
  extraRowActions,
  sprintMembership,
  snapshot
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  snapshot: BacklogValue
}) {
  const router = useRouter()
  const navigate = useNavigate()
  const resetFilters = () => {
    void navigate({
      to: router.state.location.pathname,
      search: (previous) => ({
        status: undefined,
        type: undefined,
        assignee: undefined,
        tags: undefined,
        groupId: undefined,
        hasBranch: undefined,
        hasPr: undefined,
        updatedAfter: undefined,
        archived: undefined,
        sort: undefined,
        q: undefined,
        cursor: undefined,
        view: previous.view
      }),
      replace: true,
      resetScroll: false
    })
  }
  const preview = useTicketPreview()

  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const refreshStatuses = useAtomRefresh(statusesFor(statusReq))
  const statuses: ReadonlyArray<ProjectStatus> = Result.isSuccess(
    statusesResult
  )
    ? statusesResult.value
    : EMPTY_STATUSES

  const { counts, sections } = snapshot
  const byStatus = counts.byStatus
  const hasActiveFilter =
    (query.q !== undefined && query.q.length > 0) ||
    (query.status?.length ?? 0) > 0 ||
    (query.type?.length ?? 0) > 0 ||
    (query.assignee?.length ?? 0) > 0 ||
    (query.tags?.length ?? 0) > 0 ||
    (query.groupId?.length ?? 0) > 0 ||
    query.hasBranch !== undefined ||
    query.hasPr !== undefined ||
    query.updatedAfter !== undefined ||
    query.archived !== undefined

  const filteredStatuses: ReadonlyArray<TicketStatus> = useMemo(() => {
    const requested = query.status
    const allOrdered = boardStatusesFor(statuses) as ReadonlyArray<TicketStatus>
    if (requested !== undefined && requested.length > 0) {
      return allOrdered.filter((s) => requested.includes(s))
    }
    if (!hasActiveFilter) return allOrdered
    return allOrdered.filter((s) => (byStatus[s] ?? 0) > 0)
  }, [statuses, query.status, hasActiveFilter, byStatus])

  const persistKey = statusCollapseKey(orgSlug, slug)

  const showSprintCol =
    sprintMembership !== undefined && sprintMembership.size > 0
  const showExtraActionsCol = extraRowActions !== undefined

  if (!Result.isSuccess(statusesResult)) {
    return Result.matchWithError(statusesResult, {
      onInitial: () => (
        <div
          aria-busy="true"
          className="h-96 animate-pulse rounded-lg bg-muted/40 motion-reduce:animate-none"
        />
      ),
      onError: (error) => (
        <ErrorPage error={error} reset={refreshStatuses} contained />
      ),
      onDefect: (defect) => (
        <ErrorPage error={defect} reset={refreshStatuses} contained />
      ),
      onSuccess: () => null
    })
  }

  if (counts.total === 0 && !hasActiveFilter) {
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
    return (
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FilterX strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{m.tickets_no_filter_matches_title()}</EmptyTitle>
          <EmptyDescription>{m.tickets_no_filter_matches()}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            leadingIcon={FilterX}
            onClick={resetFilters}
          >
            {m.tickets_filters_clear_all()}
          </Button>
        </EmptyContent>
      </Empty>
    )
  }

  return (
    <div
      key="sections"
      style={{ overflowAnchor: "none" }}
      className="flex flex-col gap-1 has-[[data-creating]]:[&>:not([data-creating])]:opacity-35"
    >
      {filteredStatuses.map((status) => (
        <StatusSection
          key={status}
          persistKey={persistKey}
          searchQuery={query.q}
          orgSlug={orgSlug}
          slug={slug}
          status={status}
          statuses={statuses}
          query={query}
          count={byStatus[status] ?? 0}
          page={sections[status] ?? EMPTY_PAGE}
          members={members}
          sprintMembership={sprintMembership}
          extraRowActions={extraRowActions}
          showSprintCol={showSprintCol}
          showExtraActionsCol={showExtraActionsCol}
          activePreviewId={preview.activePreviewId}
          onPreviewPointerEnter={preview.onPreviewPointerEnter}
          onPreviewOpenChange={preview.onPreviewOpenChange}
        />
      ))}
    </div>
  )
}

function StatusSection({
  persistKey,
  searchQuery,
  orgSlug,
  slug,
  status,
  statuses,
  query,
  count,
  page,
  members,
  sprintMembership,
  extraRowActions,
  showSprintCol,
  showExtraActionsCol,
  activePreviewId,
  onPreviewPointerEnter,
  onPreviewOpenChange
}: {
  persistKey: string
  searchQuery: string | undefined
  orgSlug: string
  slug: string
  status: TicketStatus
  statuses: ReadonlyArray<ProjectStatus>
  query: TicketListQuery
  count: number
  page: BacklogSection
  members: ReadonlyArray<Member>
  sprintMembership?: ReadonlyMap<TicketId, Group>
  extraRowActions?: (ticket: Ticket) => ReactNode
  showSprintCol: boolean
  showExtraActionsCol: boolean
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
      orgSlug={orgSlug}
      slug={slug}
      status={status}
      statuses={statuses}
      query={query}
      count={count}
      page={page}
      collapsed={collapsed}
      onToggleCollapsed={toggleCollapsed}
      members={members}
      sprintMembership={sprintMembership}
      extraRowActions={extraRowActions}
      showSprintCol={showSprintCol}
      showExtraActionsCol={showExtraActionsCol}
      activePreviewId={activePreviewId}
      onPreviewPointerEnter={onPreviewPointerEnter}
      onPreviewOpenChange={onPreviewOpenChange}
    />
  )
}
