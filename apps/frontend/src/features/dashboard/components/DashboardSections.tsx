import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import {
  BoardColumn,
  boardColumnClass,
  BoardColumnTitle
} from "@pp/ui/board-column"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle
} from "@pp/ui/empty"
import {
  Activity,
  CircleDot,
  Columns3,
  FolderKanban,
  Inbox,
  Rows3
} from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { SegmentedTabs, type SegmentedItem } from "@pp/ui/segmented-tabs"
import { StatusGlyph } from "@pp/ui/status-glyph"
import * as Schema from "effect/Schema"
import { useState } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { ReadFailure } from "@/components/shell/ReadFailure"
import { currentUserId } from "@/features/auth/atoms/auth"
import { getStatusIcon } from "@/features/statuses/lib/statusIcons"
import {
  myTicketBoard,
  myTickets,
  myTicketsRequest,
  myTicketUpdates,
  recentTickets,
  recentTicketsRequest,
  recentTicketUpdates,
  type CountedColumn,
  type OrgTicketsValue,
  type MyTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import { GroupingMenu } from "@/features/tickets/components/ticket-list/GroupingMenu"
import { useClearSelectionWhen } from "@/features/tickets/components/ticket-list/TicketSelection"
import { useTicketPreview } from "@/features/tickets/components/ticket-list/useTicketPreview"
import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { m } from "@/paraglide/messages"

import { DashboardCard, DashboardRows } from "./DashboardTicket"
import {
  ProjectGroupedList,
  StatusGroupedList,
  type DashboardGrouping
} from "./GroupedTicketList"
import {
  COMPACT_TICKET_LIMIT,
  MyTicketsPagination,
  RevealMoreButton,
  ShowLessButton
} from "./MyTicketsPagination"
import { TicketActivityLabel } from "./TicketActivityLabel"

export type MyTicketsView = "list" | "board"

type MyTicketsSectionProps = Readonly<{
  orgSlug: string
  view: MyTicketsView
  onViewChange: (view: MyTicketsView) => void
}>

const GroupingSchema = Schema.Literals(["project", "status", "none"])
const groupingCodec = createLocalStorageCodec(GroupingSchema)

const GROUPING_OPTIONS = [
  { key: "project", label: m.tickets_grouping_project(), icon: FolderKanban },
  { key: "status", label: m.tickets_grouping_status(), icon: CircleDot },
  { key: "none", label: m.tickets_grouping_none(), icon: Rows3 }
] as const

const VIEW_ITEMS: ReadonlyArray<SegmentedItem<MyTicketsView>> = [
  { key: "list", label: m.tickets_view_list(), icon: Rows3 },
  { key: "board", label: m.tickets_view_board(), icon: Columns3 }
]

export function MyTicketsSection({
  orgSlug,
  view,
  onViewChange
}: MyTicketsSectionProps) {
  const viewerId = useAtomValue(currentUserId)
  const preferencesKey = `${viewerId ?? ""}:${orgSlug}`
  const [grouping, setGrouping] = useLocalStorageState(
    `projectproject:dashboard-grouping:${preferencesKey}`,
    groupingCodec,
    "project"
  )
  useClearSelectionWhen(grouping)
  return (
    <section className="flex flex-col gap-3">
      <div className="flex h-9 items-center justify-between gap-3">
        <h2 className="text-title font-semibold">
          {m.org_dashboard_my_tickets_heading()}
        </h2>
        <div className="flex items-center gap-2">
          {view === "list" && (
            <GroupingMenu
              value={grouping}
              options={GROUPING_OPTIONS}
              onChange={setGrouping}
            />
          )}
          <div role="group" aria-label={m.org_dashboard_view_tabs_aria_label()}>
            <SegmentedTabs
              items={VIEW_ITEMS}
              value={view}
              onValueChange={onViewChange}
            />
          </div>
        </div>
      </div>
      {view === "board" ? (
        <MyTicketsBoard orgSlug={orgSlug} />
      ) : (
        <MyTicketsList
          orgSlug={orgSlug}
          grouping={grouping}
          collapseKey={`projectproject:dashboard-sections-collapsed:${preferencesKey}:${grouping}`}
        />
      )}
    </section>
  )
}

function MyTicketsList({
  orgSlug,
  grouping,
  collapseKey
}: Readonly<{
  orgSlug: string
  grouping: DashboardGrouping
  collapseKey: string
}>) {
  const grouped = {
    orgSlug,
    collapseKey,
    loading: <RowsSkeleton count={4} />,
    empty: <EmptyTickets />
  }
  if (grouping === "project") return <ProjectGroupedList {...grouped} />
  if (grouping === "status") return <StatusGroupedList {...grouped} />
  return <FlatTicketList req={myTicketsRequest(orgSlug)} />
}

function FlatTicketList({ req }: Readonly<{ req: MyTicketsRequest }>) {
  const [expanded, setExpanded] = useState(false)
  const preview = useTicketPreview()
  const result = useAtomValue(myTickets(req))
  const refresh = useAtomRefresh(myTickets(req))
  return (
    <AsyncView
      result={result}
      onFailure={(failure) => (
        <ReadFailure failure={failure} onRetry={refresh} />
      )}
      onInitial={() => <RowsSkeleton count={4} />}
      onSuccess={({ value }) => (
        <FlatTicketRows
          req={req}
          value={value}
          expanded={expanded}
          setExpanded={setExpanded}
          preview={preview}
        />
      )}
    />
  )
}

function FlatTicketRows({
  req,
  value,
  expanded,
  setExpanded,
  preview
}: Readonly<{
  req: MyTicketsRequest
  value: OrgTicketsValue
  expanded: boolean
  setExpanded: (expanded: boolean) => void
  preview: ReturnType<typeof useTicketPreview>
}>) {
  const limit = expanded ? undefined : COMPACT_TICKET_LIMIT
  return value.tickets.length === 0 ? (
    <EmptyTickets />
  ) : (
    <>
      <DashboardRows
        orgSlug={req.params.orgSlug}
        tickets={
          limit === undefined ? value.tickets : value.tickets.slice(0, limit)
        }
        update={myTicketUpdates(req)}
        preview={preview}
      />
      {expanded ? (
        <>
          <MyTicketsPagination
            req={req}
            nextCursor={value.nextCursor}
            loaded={value.tickets.length}
            total={value.total}
          />
          <ShowLessButton onCollapse={() => setExpanded(false)} />
        </>
      ) : (
        value.total > COMPACT_TICKET_LIMIT && (
          <RevealMoreButton
            remaining={value.total - COMPACT_TICKET_LIMIT}
            onReveal={() => setExpanded(true)}
          />
        )
      )}
    </>
  )
}

function MyTicketsBoard({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const req = myTicketsRequest(orgSlug)
  const result = useAtomValue(myTicketBoard(req))
  const refresh = useAtomRefresh(myTicketBoard(req))
  return (
    <AsyncView
      result={result}
      onFailure={(failure) => (
        <ReadFailure failure={failure} onRetry={refresh} />
      )}
      onInitial={() => <BoardSkeleton />}
      onSuccess={({ value }) =>
        value.columns.every((column) => column.items.length === 0) ? (
          <EmptyTickets />
        ) : (
          <>
            <TicketBoard req={req} columns={value.columns} />
            <MyTicketsPagination
              req={req}
              nextCursor={value.nextCursor}
              loaded={value.columns.reduce(
                (sum, column) => sum + column.items.length,
                0
              )}
              total={value.total}
            />
          </>
        )
      }
    />
  )
}

export function RecentTicketsSection({
  orgSlug
}: Readonly<{ orgSlug: string }>) {
  const req = recentTicketsRequest(orgSlug)
  const preview = useTicketPreview()
  const result = useAtomValue(recentTickets(req))
  const refresh = useAtomRefresh(recentTickets(req))
  return (
    <section className="flex flex-col gap-3">
      <h2 className="flex h-9 items-center text-title font-semibold">
        {m.org_dashboard_recent_heading()}
      </h2>
      <AsyncView
        result={result}
        onFailure={(failure) => (
          <ReadFailure failure={failure} onRetry={refresh} />
        )}
        onInitial={() => <RowsSkeleton count={3} />}
        onSuccess={({ value }) =>
          value.tickets.length === 0 ? (
            <EmptyRecent />
          ) : (
            <DashboardRows
              orgSlug={orgSlug}
              tickets={value.tickets}
              update={recentTicketUpdates(req)}
              preview={preview}
              below={(item) => <TicketActivityLabel activity={item.activity} />}
            />
          )
        }
      />
    </section>
  )
}

function TicketBoard({
  req,
  columns
}: Readonly<{
  req: MyTicketsRequest
  columns: ReadonlyArray<CountedColumn>
}>) {
  return (
    <div className="scroll-fade-x -mx-4 h-[min(40rem,70vh)] overflow-x-auto px-4">
      <div className="flex h-full gap-3">
        {columns.map((column) => (
          <BoardColumn
            key={column.key}
            title={
              <BoardColumnTitle
                icon={
                  <StatusGlyph
                    icon={getStatusIcon(column.icon)}
                    color={column.color}
                  />
                }
                label={column.label}
              />
            }
            count={column.count}
            scrollLabel={m.common_scroll_area_label()}
          >
            {column.items.map((item) => (
              <DashboardCard
                key={`${item.project.slug}/${item.ticket.id}`}
                orgSlug={req.params.orgSlug}
                item={item}
                update={myTicketUpdates(req)}
              />
            ))}
          </BoardColumn>
        ))}
      </div>
    </div>
  )
}

// Dashboard sections sit side by side under the projects, so their empty
// states stay subtle and still.
function EmptyTickets() {
  return (
    <Empty intensity="subtle" animated={false} className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Inbox strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.org_dashboard_my_tickets_empty_title()}</EmptyTitle>
        <EmptyDescription>
          {m.org_dashboard_my_tickets_empty_body()}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function EmptyRecent() {
  return (
    <Empty intensity="subtle" animated={false} className="min-h-56">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Activity strokeWidth={1.75} />
        </EmptyMedia>
        <EmptyTitle>{m.org_dashboard_recent_empty_title()}</EmptyTitle>
        <EmptyDescription>{m.org_dashboard_recent_empty()}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}

function RowsSkeleton({ count }: Readonly<{ count: number }>) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="h-10 skeleton rounded-md bg-muted/60" />
      ))}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(boardColumnClass, "h-48 skeleton")} />
      ))}
    </div>
  )
}
