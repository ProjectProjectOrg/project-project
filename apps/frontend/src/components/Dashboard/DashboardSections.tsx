import { useAtomRefresh, useAtomValue } from "@effect/atom-react"
import { MY_TICKETS_LIMIT } from "@pp/shared"
import * as Schema from "effect/Schema"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Columns3, Rows3 } from "lucide-react"
import type { ReactNode } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  SEGMENTED_ITEM_CLASS,
  SegmentedTabs,
  type SegmentedItem
} from "@/components/SegmentedTabs"
import {
  BoardColumnShell,
  BOARD_COLUMN_CLASS
} from "@/components/sprints/BoardColumnShell"
import { GroupingMenu } from "@/components/TicketList/GroupingMenu"
import { useTicketPreview } from "@/components/TicketList/useTicketPreview"
import { me } from "@/features/auth/atoms/auth"
import {
  myTicketBoard,
  myTickets,
  orgTicketsRequest,
  recentTickets,
  updateMyTicket,
  updateRecentTicket,
  type OrgTicket,
  type OrgTicketsRequest
} from "@/features/tickets/atoms/myTickets"
import { useLocalStorageState } from "@/hooks/useLocalStorageState"
import { getStatusIcon } from "@/lib/status-icons"
import type { PlacedColumn } from "@/lib/statusColumns"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { DashboardCard, DashboardRows } from "./DashboardTicket"
import {
  ProjectGroupedList,
  StatusGroupedList,
  type DashboardGrouping
} from "./GroupedTicketList"
import { TicketActivityLabel } from "./TicketActivityLabel"

export type MyTicketsView = "list" | "board"

type MyTicketsSectionProps = Readonly<{
  orgSlug: string
  view: MyTicketsView
  onViewChange: (view: MyTicketsView) => void
}>

const GroupingSchema = Schema.Literals(["project", "status", "none"])

const GROUPING_OPTIONS = [
  { key: "project", label: m.tickets_grouping_project() },
  { key: "status", label: m.tickets_grouping_status() },
  { key: "none", label: m.tickets_grouping_none() }
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
  const viewer = useAtomValue(me())
  const viewerId = Result.isSuccess(viewer) ? viewer.value.id : ""
  const preferencesKey = `${viewerId}:${orgSlug}`
  const [grouping, setGrouping] = useLocalStorageState(
    `projectproject:dashboard-grouping:${preferencesKey}`,
    GroupingSchema,
    "project"
  )
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold tracking-tight">
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
              isActive={(key) => key === view}
              renderItem={(item, content, { active }) => (
                <button
                  type="button"
                  onClick={() => {
                    if (item.key !== view) onViewChange(item.key)
                  }}
                  aria-pressed={active}
                  className={SEGMENTED_ITEM_CLASS(active)}
                >
                  {content}
                </button>
              )}
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
  const req = orgTicketsRequest(orgSlug)
  const grouped = {
    req,
    collapseKey,
    loading: <RowsSkeleton count={4} />,
    empty: <EmptyTickets />,
    footer: (hasMore: boolean) => hasMore && <TruncatedNote />
  }
  if (grouping === "project") return <ProjectGroupedList {...grouped} />
  if (grouping === "status") return <StatusGroupedList {...grouped} />
  return <FlatTicketList req={req} />
}

function FlatTicketList({ req }: Readonly<{ req: OrgTicketsRequest }>) {
  const preview = useTicketPreview()
  const result = useAtomValue(myTickets(req))
  const refresh = useAtomRefresh(myTickets(req))
  return Result.matchWithError(result, {
    onInitial: () => <RowsSkeleton count={4} />,
    onError: (error) => <ErrorPage error={error} reset={refresh} contained />,
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refresh} contained />
    ),
    onSuccess: ({ value }) =>
      value.tickets.length === 0 ? (
        <EmptyTickets />
      ) : (
        <>
          <DashboardRows
            req={req}
            tickets={value.tickets}
            update={updateMyTicket}
            preview={preview}
          />
          {value.hasMore && <TruncatedNote />}
        </>
      )
  })
}

function MyTicketsBoard({ orgSlug }: Readonly<{ orgSlug: string }>) {
  const req = orgTicketsRequest(orgSlug)
  const result = useAtomValue(myTicketBoard(req))
  const refresh = useAtomRefresh(myTicketBoard(req))
  return Result.matchWithError(result, {
    onInitial: () => <BoardSkeleton />,
    onError: (error) => <ErrorPage error={error} reset={refresh} contained />,
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refresh} contained />
    ),
    onSuccess: ({ value }) =>
      value.columns.every((column) => column.items.length === 0) ? (
        <EmptyTickets />
      ) : (
        <>
          <TicketBoard req={req} columns={value.columns} />
          {value.hasMore && <TruncatedNote />}
        </>
      )
  })
}

export function RecentTicketsSection({
  orgSlug
}: Readonly<{ orgSlug: string }>) {
  const req = orgTicketsRequest(orgSlug)
  const preview = useTicketPreview()
  const result = useAtomValue(recentTickets(req))
  const refresh = useAtomRefresh(recentTickets(req))
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold tracking-tight">
        {m.org_dashboard_recent_heading()}
      </h2>
      {Result.matchWithError(result, {
        onInitial: () => <RowsSkeleton count={3} />,
        onError: (error) => (
          <ErrorPage error={error} reset={refresh} contained />
        ),
        onDefect: (defect) => (
          <ErrorPage error={defect} reset={refresh} contained />
        ),
        onSuccess: ({ value }) =>
          value.tickets.length === 0 ? (
            <EmptyNote>{m.org_dashboard_recent_empty()}</EmptyNote>
          ) : (
            <DashboardRows
              req={req}
              tickets={value.tickets}
              update={updateRecentTicket}
              preview={preview}
              trailing={(item) => (
                <TicketActivityLabel activity={item.activity} />
              )}
            />
          )
      })}
    </section>
  )
}

function TicketBoard({
  req,
  columns
}: Readonly<{
  req: OrgTicketsRequest
  columns: ReadonlyArray<PlacedColumn<OrgTicket>>
}>) {
  return (
    <div className="-mx-4 h-[min(40rem,70vh)] overflow-x-auto px-4">
      <div className="flex h-full gap-3">
        {columns.map((column) => (
          <BoardColumnShell
            key={column.key}
            meta={{
              icon: getStatusIcon(column.icon),
              label: column.label,
              className: "",
              color: column.color
            }}
            count={column.items.length}
          >
            {column.items.map((item) => (
              <DashboardCard
                key={`${item.project.slug}/${item.ticket.id}`}
                req={req}
                item={item}
                update={updateMyTicket}
              />
            ))}
          </BoardColumnShell>
        ))}
      </div>
    </div>
  )
}

function EmptyTickets() {
  return (
    <div className="rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <div className="text-sm font-medium">
        {m.org_dashboard_my_tickets_empty_title()}
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {m.org_dashboard_my_tickets_empty_body()}
      </p>
    </div>
  )
}

function EmptyNote({ children }: Readonly<{ children: ReactNode }>) {
  return <p className="px-3 text-xs text-muted-foreground">{children}</p>
}

function TruncatedNote() {
  return (
    <EmptyNote>
      {m.org_dashboard_my_tickets_truncated({ count: MY_TICKETS_LIMIT })}
    </EmptyNote>
  )
}

function RowsSkeleton({ count }: Readonly<{ count: number }>) {
  return (
    <div className="flex flex-col gap-1">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="skeleton h-10 rounded-md bg-muted/60" />
      ))}
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3">
      {[0, 1, 2].map((i) => (
        <div key={i} className={cn(BOARD_COLUMN_CLASS, "skeleton h-48")} />
      ))}
    </div>
  )
}
