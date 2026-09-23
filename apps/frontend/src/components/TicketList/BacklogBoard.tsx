import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import {
  RegistryContext,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import type {
  Member,
  ProjectStatus,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { Loader2 } from "lucide-react"
import { motion, Reorder } from "motion/react"
import { useContext, useEffect, useMemo, useRef, useState } from "react"

import { ErrorPage } from "@/components/ErrorPage"
import {
  boardStatusesFor,
  type ColumnDropData,
  type DragData
} from "@/components/sprints/board-utils"
import { SprintBoardColumn } from "@/components/sprints/SprintBoardColumn"
import { useBoardViewport } from "@/components/sprints/useBoardViewport"
import { Button } from "@/components/ui/button"
import { DitherShell } from "@/components/ui/dither-shell"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  backlogRequest,
  loadMoreBacklog,
  updateBacklogTicket,
  type BacklogRequest,
  type BacklogRow,
  type BacklogValue
} from "@/features/tickets/atoms/backlog"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { AutoLoad } from "./VirtualRows"

const COLUMN_SCROLL_SELECTOR = "[data-virtual-sprint-column]"

const NO_TICKETS: ReadonlyArray<Ticket> = []

type BacklogBoardProps = Readonly<{
  orgSlug: string
  slug: string
  query: TicketListQuery
  members: ReadonlyArray<Member>
  snapshot: BacklogValue
  reorderMode: boolean
  onEnterReorder: () => void
  onExitReorder: () => void
  dragOrder: ReadonlyArray<string> | null
  setDragOrder: (next: ReadonlyArray<string> | null) => void
}>

export function BacklogBoard(props: BacklogBoardProps) {
  const { orgSlug, slug } = props
  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statuses = useAtomValue(statusesFor(statusReq))
  const refreshStatuses = useAtomRefresh(statusesFor(statusReq))

  return Result.matchWithError(statuses, {
    onInitial: () => (
      <DitherShell contained animated>
        {null}
      </DitherShell>
    ),
    onError: (error) => (
      <ErrorPage error={error} reset={refreshStatuses} contained />
    ),
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refreshStatuses} contained />
    ),
    onSuccess: ({ value }) => (
      <BacklogBoardContent {...props} statuses={value} />
    )
  })
}

function BacklogBoardContent({
  orgSlug,
  slug,
  query,
  members,
  snapshot,
  statuses,
  reorderMode,
  onEnterReorder,
  onExitReorder,
  dragOrder,
  setDragOrder
}: BacklogBoardProps & { statuses: ReadonlyArray<ProjectStatus> }) {
  const req = useMemo(
    () => backlogRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const ref = useRef<HTMLDivElement>(null)
  const groupRef = useRef<HTMLDivElement>(null)
  const [frozenWidth, setFrozenWidth] = useState<number | null>(null)
  const { height, hasRightOverflow } = useBoardViewport(ref)

  useEffect(() => {
    if (reorderMode) {
      const w = groupRef.current?.scrollWidth ?? null
      if (w) setFrozenWidth(w)
    } else {
      setFrozenWidth(null)
    }
  }, [reorderMode])

  useEffect(() => {
    if (!reorderMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitReorder()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [reorderMode, onExitReorder])

  const registry = useContext(RegistryContext)

  const statusSlugs = useMemo(() => {
    const all = boardStatusesFor(statuses) as ReadonlyArray<TicketStatus>
    const requested = query.status
    return requested !== undefined && requested.length > 0
      ? all.filter((s) => requested.includes(s))
      : all
  }, [statuses, query.status])

  const order = dragOrder ?? statusSlugs

  const columns = useMemo(
    () => buildColumns(snapshot, statusSlugs),
    [snapshot, statusSlugs]
  )

  const inertTicketIds = useMemo(
    () =>
      new Set<TicketId>(
        columns.flatMap((column) =>
          column.rows.filter((row) => row.pending).map((row) => row.ticket.id)
        )
      ),
    [columns]
  )

  const columnsRef = useRef(columns)
  columnsRef.current = columns

  useEffect(() => {
    const el = ref.current
    if (!el || reorderMode) return
    const cleanupAutoScroll = autoScrollForElements({
      element: el,
      getAllowedAxis: () => "horizontal"
    })
    const cleanupMonitor = monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data as unknown as DragData
        const dst = target.data as unknown as ColumnDropData
        if (src.type !== "card" || dst.type !== "column") return
        if (dst.status === src.status) return
        const row = columnsRef.current
          .find((column) => column.status === src.status)
          ?.rows.find((r) => r.ticket.id === src.id)
        if (!row || row.pending) return
        registry.set(updateBacklogTicket({ req, id: src.id }), {
          status: dst.status as TicketStatus
        })
      }
    })
    return () => {
      cleanupAutoScroll()
      cleanupMonitor()
    }
  }, [reorderMode, req, registry])

  return (
    <motion.div
      ref={ref}
      layoutScroll
      style={{ height: height ?? 240 }}
      className={cn(
        "overflow-x-auto",
        hasRightOverflow &&
          "[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
      )}
    >
      <Reorder.Group
        ref={groupRef}
        as="div"
        axis="x"
        values={order as Array<string>}
        onReorder={(next) => setDragOrder(next)}
        style={frozenWidth ? { width: `${frozenWidth}px` } : undefined}
        className="flex h-full gap-3"
      >
        {order.map((status) => {
          const column = columns.find((c) => c.status === status)
          return (
            <SprintBoardColumn
              key={status}
              orgSlug={orgSlug}
              slug={slug}
              backlogReq={req}
              status={status}
              statuses={statuses}
              tickets={column?.tickets ?? NO_TICKETS}
              count={column?.count ?? 0}
              members={members}
              isDraggable
              ordered={false}
              inertTicketIds={inertTicketIds}
              lastFlash={null}
              reorderMode={reorderMode}
              onActivateReorder={onEnterReorder}
              footer={
                column?.nextCursor != null ? (
                  <ColumnLoadMore
                    req={req}
                    status={status as TicketStatus}
                    cursor={column.nextCursor}
                    remaining={Math.max(0, column.count - column.rows.length)}
                  />
                ) : null
              }
            />
          )
        })}
      </Reorder.Group>
    </motion.div>
  )
}

type BoardColumn = Readonly<{
  status: string
  rows: ReadonlyArray<BacklogRow>
  tickets: ReadonlyArray<Ticket>
  count: number
  nextCursor: string | null
}>

function buildColumns(
  snapshot: BacklogValue,
  statusSlugs: ReadonlyArray<TicketStatus>
): ReadonlyArray<BoardColumn> {
  return statusSlugs.map((status) => {
    const page = snapshot.sections[status]
    const rows = page?.items ?? []
    return {
      status,
      rows,
      tickets: rows.map((row) => row.ticket),
      count: snapshot.counts.byStatus[status] ?? 0,
      nextCursor: page?.nextCursor ?? null
    }
  })
}

function ColumnLoadMore({
  req,
  status,
  cursor,
  remaining
}: {
  req: BacklogRequest
  status: TicketStatus
  cursor: string
  remaining: number
}) {
  const loadMore = useAtomSet(loadMoreBacklog({ req, status }))
  const loadMoreState = useAtomValue(loadMoreBacklog({ req, status }))
  const failed = Result.isFailure(loadMoreState)

  return (
    <>
      {Result.matchWithError(loadMoreState, {
        onInitial: () => null,
        onError: (error) => (
          <ErrorPage error={error} reset={() => loadMore()} contained />
        ),
        onDefect: (defect) => (
          <ErrorPage error={defect} reset={() => loadMore()} contained />
        ),
        onSuccess: () => null
      })}
      <AutoLoad
        key={cursor}
        cursor={cursor}
        enabled={!loadMoreState.waiting && !failed}
        loadMore={() => loadMore()}
        rootSelector={COLUMN_SCROLL_SELECTOR}
      >
        {failed ? (
          <Button
            type="button"
            variant="tertiary"
            size="sm"
            onClick={() => loadMore()}
          >
            {m.tickets_section_load_more_button({ remaining })}
          </Button>
        ) : (
          <div
            role="status"
            className={cn(
              "flex h-7 items-center gap-2 text-xs text-muted-foreground",
              !loadMoreState.waiting && "invisible"
            )}
          >
            <Loader2
              className="size-4 animate-spin motion-reduce:animate-none"
              strokeWidth={1.75}
            />
            {m.tickets_load_more_loading()}
          </div>
        )}
      </AutoLoad>
    </>
  )
}
