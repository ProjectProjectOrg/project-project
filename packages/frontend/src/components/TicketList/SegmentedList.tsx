import { Result, useAtomValue } from "@effect-atom/atom-react"
import { useMemo, useRef, type ReactNode } from "react"
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
import {
  projectKey as projectStatusKey,
  projectStatusesAtom
} from "@/atoms/projectStatuses"
import { ticketsCountAtom, ticketsCountKey } from "@/atoms/tickets"
import { m } from "@/paraglide/messages"
import type {
  Group,
  Member,
  ProjectStatus,
  Ticket,
  TicketCountQuery,
  TicketCounts,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import { cn } from "@/lib/utils"
import { useResetTicketSearch } from "./url"
import { SectionList } from "./SectionList"

const EMPTY_COUNTS: TicketCounts = { total: 0, byStatus: {} }

function queryHasActiveFilter(q: TicketListQuery): boolean {
  if (q.q !== undefined) return true
  const f = q.filter
  if (!f) return false
  return (
    (f.status?.length ?? 0) > 0 ||
    (f.type?.length ?? 0) > 0 ||
    (f.assignee?.length ?? 0) > 0 ||
    (f.tags?.length ?? 0) > 0 ||
    (f.groupId?.length ?? 0) > 0
  )
}

type ActiveSnapshot = {
  readonly key: string
  readonly query: TicketListQuery
  readonly counts: TicketCounts
}

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
  hasActiveFilter
}: {
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  extraRowActions?: (ticket: Ticket) => ReactNode
  sprintMembership?: ReadonlyMap<TicketId, Group>
  hasActiveFilter: boolean
}) {
  const resetFilters = useResetTicketSearch()

  const statusesResult = useAtomValue(
    projectStatusesAtom(projectStatusKey(orgSlug, slug))
  )
  const statuses: ReadonlyArray<ProjectStatus> = Result.isSuccess(statusesResult)
    ? statusesResult.value
    : EMPTY_STATUSES

  const countQuery: TicketCountQuery = { filter: query.filter, q: query.q }
  const currentCountsKey = ticketsCountKey(orgSlug, slug, countQuery)
  const countsResult = useAtomValue(ticketsCountAtom(currentCountsKey))

  const activeRef = useRef<ActiveSnapshot | null>(null)
  if (Result.isSuccess(countsResult)) {
    activeRef.current = {
      key: currentCountsKey,
      query,
      counts: countsResult.value
    }
  }
  const active = activeRef.current
  const isStale = active === null || active.key !== currentCountsKey

  const renderQuery = active?.query ?? query
  const counts = active?.counts ?? EMPTY_COUNTS
  const byStatus = counts.byStatus
  const renderHasActiveFilter = queryHasActiveFilter(renderQuery)

  const filteredStatuses: ReadonlyArray<TicketStatus> = useMemo(() => {
    const requested = renderQuery.filter?.status
    const allOrdered = boardStatusesFor(statuses) as ReadonlyArray<TicketStatus>
    if (requested !== undefined && requested.length > 0) {
      return allOrdered.filter((s) => requested.includes(s))
    }
    if (!renderHasActiveFilter) return allOrdered
    return allOrdered.filter((s) => (byStatus[s] ?? 0) > 0)
  }, [statuses, renderQuery.filter, renderHasActiveFilter, byStatus])

  const [collapsedRaw, setCollapsedRaw] = useLocalStorageState(
    `projectproject:ticket-list-collapsed:${orgSlug}/${slug}`,
    CollapsedSchema,
    EMPTY_COLLAPSED
  )
  const collapsedSet = useMemo(() => new Set(collapsedRaw), [collapsedRaw])
  const toggleCollapsed = (status: TicketStatus) => {
    if (collapsedSet.has(status)) {
      setCollapsedRaw(collapsedRaw.filter((s) => s !== status))
    } else {
      setCollapsedRaw([...collapsedRaw, status])
    }
  }

  const showSprintCol =
    sprintMembership !== undefined && sprintMembership.size > 0
  const showExtraActionsCol = extraRowActions !== undefined

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

  if (filteredStatuses.length === 0 && hasActiveFilter && !isStale) {
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
      className={cn(
        "flex flex-col gap-1 has-[[data-creating]]:[&>:not([data-creating])]:opacity-35",
        isStale && "animate-pulse"
      )}
    >
      {filteredStatuses.map((status) => {
        const forceExpanded =
          renderQuery.q !== undefined && (byStatus[status] ?? 0) > 0
        return (
          <SectionList
            key={status}
            orgSlug={orgSlug}
            slug={slug}
            status={status}
            statuses={statuses}
            query={renderQuery}
            count={byStatus[status] ?? 0}
            collapsed={!forceExpanded && collapsedSet.has(status)}
            forceExpanded={forceExpanded}
            onToggleCollapsed={() => toggleCollapsed(status)}
            members={members}
            sprintMembership={sprintMembership}
            extraRowActions={extraRowActions}
            showSprintCol={showSprintCol}
            showExtraActionsCol={showExtraActionsCol}
          />
        )
      })}
    </div>
  )
}
