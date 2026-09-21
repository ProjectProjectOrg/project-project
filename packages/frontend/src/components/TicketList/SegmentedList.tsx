import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { useNavigate, useRouter } from "@tanstack/react-router"
import { useCallback, useMemo, useState, type ReactNode } from "react"
import { FilterX, ListChecks } from "lucide-react"
import * as Schema from "effect/Schema"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
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
import { ErrorPage } from "@/components/ErrorPage"
import { statusesFor, statusesRequest } from "@/atoms/projectStatuses"
import type { BacklogValue } from "@/atoms/backlog"
import { m } from "@/paraglide/messages"
import type {
  Group,
  Member,
  ProjectStatus,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import { SectionList } from "./SectionList"

const CollapsedSchema = Schema.Array(Schema.String)
const EMPTY_STATUSES: ReadonlyArray<ProjectStatus> = []
const EMPTY_COLLAPSED: ReadonlyArray<string> = []

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
  const [activePreviewId, setActivePreviewId] = useState<TicketId | null>(null)
  const handlePreviewPointerEnter = useCallback((ticketId: TicketId) => {
    setActivePreviewId((current) => (current === ticketId ? current : null))
  }, [])
  const handlePreviewOpenChange = useCallback(
    (ticketId: TicketId, open: boolean) => {
      setActivePreviewId((current) =>
        open ? ticketId : current === ticketId ? null : current
      )
    },
    []
  )

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

  const [collapsedRaw, setCollapsedRaw] = useLocalStorageState(
    `projectproject:ticket-list-collapsed:${orgSlug}/${slug}`,
    CollapsedSchema,
    EMPTY_COLLAPSED
  )
  const [searchCollapsed, setSearchCollapsed] = useState<ReadonlyArray<string>>(
    []
  )
  const collapsed = query.q ? searchCollapsed : collapsedRaw
  const setCollapsed = query.q ? setSearchCollapsed : setCollapsedRaw
  const collapsedSet = useMemo(() => new Set(collapsed), [collapsed])
  const toggleCollapsed = (status: TicketStatus) => {
    if (collapsedSet.has(status)) {
      setCollapsed(collapsed.filter((s) => s !== status))
    } else {
      setCollapsed([...collapsed, status])
    }
  }

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
        <SectionList
          key={status}
          orgSlug={orgSlug}
          slug={slug}
          status={status}
          statuses={statuses}
          query={query}
          count={byStatus[status] ?? 0}
          page={sections[status] ?? { items: [], nextCursor: null }}
          collapsed={collapsedSet.has(status)}
          onToggleCollapsed={() => toggleCollapsed(status)}
          members={members}
          sprintMembership={sprintMembership}
          extraRowActions={extraRowActions}
          showSprintCol={showSprintCol}
          showExtraActionsCol={showExtraActionsCol}
          activePreviewId={activePreviewId}
          onPreviewPointerEnter={handlePreviewPointerEnter}
          onPreviewOpenChange={handlePreviewOpenChange}
        />
      ))}
    </div>
  )
}
