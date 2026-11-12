import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import {
  RegistryContext,
  useAtomRefresh,
  useAtomSet,
  useAtomValue
} from "@effect/atom-react"
import { TicketPolicy } from "@pp/access/policies"
import type {
  Member,
  ProjectStatus,
  Ticket,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { motion, Reorder } from "motion/react"
import { useContext, useEffect, useMemo, useRef } from "react"

import { AsyncView } from "@/components/shell/AsyncView"
import { Button } from "@/components/ui/button"
import { DitherShell } from "@/components/ui/dither-shell"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import { HiddenColumnsEmpty } from "@/features/sprints/components/HiddenColumnsEmpty"
import { SprintBoardColumn } from "@/features/sprints/components/SprintBoardColumn"
import { useBoardColumns } from "@/features/sprints/hooks/useBoardColumns"
import {
  BoardKeyboardContext,
  useBoardKeyboardNavigation
} from "@/features/sprints/hooks/useBoardKeyboardNavigation"
import { useBoardViewport } from "@/features/sprints/hooks/useBoardViewport"
import { useHorizontalAutoScroll } from "@/features/sprints/hooks/useHorizontalAutoScroll"
import { useReorderMode } from "@/features/sprints/hooks/useReorderMode"
import { visibleColumns } from "@/features/sprints/lib/boardColumns"
import {
  boardEdit,
  boardMove,
  boardStatusesFor,
  isDragData,
  isDropData
} from "@/features/sprints/lib/boardUtils"
import {
  backlogRequest,
  loadMoreBacklog,
  updateBacklogTicket,
  type BacklogRequest,
  backlogTicketUpdates,
  encodeTicketListQuery,
  type BacklogValue
} from "@/features/tickets/atoms/backlog"
import type { TicketRow } from "@/features/tickets/lib/ticketRows"
import { useProjectActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useExpandSubTicketsCommand } from "./useExpandSubTicketsCommand"

const NO_TICKETS: ReadonlyArray<Ticket> = []

type BacklogBoardProps = Readonly<{
  query: TicketListQuery
  members: ReadonlyArray<Member>
  snapshot: BacklogValue
  reorderMode: boolean
  onEnterReorder: () => void
  onExitReorder: () => void
  dragOrder: ReadonlyArray<TicketStatus> | null
  setDragOrder: (next: ReadonlyArray<TicketStatus> | null) => void
}>

export function BacklogBoard(props: BacklogBoardProps) {
  const { orgSlug, slug } = useProjectRoute()
  const statusReq = statusesRequest(orgSlug, slug)
  const statuses = useAtomValue(statusesFor(statusReq))
  const refreshStatuses = useAtomRefresh(statusesFor(statusReq))

  return (
    <AsyncView
      result={statuses}
      contained
      reset={refreshStatuses}
      onInitial={() => (
        <DitherShell contained animated>
          {null}
        </DitherShell>
      )}
      onSuccess={({ value }) => (
        <BacklogBoardContent {...props} statuses={value} />
      )}
    />
  )
}

function BacklogBoardContent({
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
  useExpandSubTicketsCommand()
  const { orgSlug, slug } = useProjectRoute()
  const req = useMemo(
    () => backlogRequest(orgSlug, slug, query),
    [orgSlug, slug, query]
  )
  const ref = useRef<HTMLDivElement>(null)
  const actor = useProjectActor()
  const canMove = TicketPolicy.canChange(actor, { status: true })
  const manual =
    query.sort.key === "manual" &&
    TicketPolicy.canChange(actor, { content: true })
  const canDrag = canMove || manual
  const groupRef = useReorderMode(reorderMode, onExitReorder)
  const { height, hasRightOverflow } = useBoardViewport(ref)
  useHorizontalAutoScroll(ref, !reorderMode && canDrag)

  const registry = useContext(RegistryContext)

  const layout = useBoardColumns("backlog")
  const statusSlugs = useMemo(
    () => visibleColumns(boardStatusesFor(statuses), layout.hidden),
    [statuses, layout.hidden]
  )

  const order =
    dragOrder === null
      ? statusSlugs
      : dragOrder.flatMap((slug) =>
          statusSlugs.filter((status) => status === slug)
        )

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
    if (!el || reorderMode || !canDrag) return
    return monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data
        const dst = target.data
        if (!isDragData(src) || !isDropData(dst)) return
        if (dst.type === "card" && dst.id === src.id) return
        const row = columnsRef.current
          .find((column) => column.status === src.status)
          ?.rows.find((r) => r.ticket.id === src.id)
        if (!row || row.pending) return
        const status = dst.status !== src.status ? dst.status : undefined
        if (status !== undefined && !canMove) return
        const column =
          columnsRef.current.find((c) => c.status === dst.status)?.tickets ?? []
        const position = manual
          ? boardMove(column, column, src.id, dst)
          : undefined
        const edit = boardEdit(status, position)
        if (edit === null) return
        registry.set(updateBacklogTicket({ req, id: src.id }), edit)
      }
    })
  }, [canDrag, canMove, manual, reorderMode, req, registry])

  const keyboard = useBoardKeyboardNavigation(
    ref,
    !reorderMode && order.length > 0
  )

  return (
    <BoardKeyboardContext value={keyboard.context}>
      <motion.div
        ref={ref}
        role={keyboard.context ? "grid" : undefined}
        aria-label={m.tickets_board_aria_label()}
        aria-colcount={keyboard.context ? order.length : undefined}
        aria-rowcount={keyboard.context ? 1 : undefined}
        onKeyDown={keyboard.onKeyDown}
        layoutScroll
        style={{ height: height ?? 240 }}
        className={cn(
          "overflow-x-auto overscroll-x-contain",
          hasRightOverflow &&
            "[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
        )}
      >
        {order.length === 0 && layout.hidden.length > 0 ? (
          <HiddenColumnsEmpty onShowAll={layout.showAll} />
        ) : (
          <Reorder.Group
            ref={groupRef}
            as="div"
            role={keyboard.context ? "row" : undefined}
            axis="x"
            values={[...order]}
            onReorder={(next) => setDragOrder(next)}
            className="flex h-full gap-3"
          >
            {order.map((status, columnIndex) => {
              const column = columns.find((c) => c.status === status)
              return (
                <SprintBoardColumn
                  key={status}
                  columnIndex={columnIndex}
                  update={backlogTicketUpdates(req)}
                  status={status}
                  statuses={statuses}
                  tickets={column?.tickets ?? NO_TICKETS}
                  filterKey={encodeTicketListQuery(query)}
                  count={column?.count ?? 0}
                  members={members}
                  isDraggable={canDrag}
                  ordered={manual}
                  inertTicketIds={inertTicketIds}
                  lastFlash={null}
                  reorderMode={reorderMode}
                  onActivateReorder={onEnterReorder}
                  collapsed={layout.collapsed.includes(status)}
                  onToggleCollapsed={() => layout.toggleCollapsed(status)}
                  footer={(nearEnd) =>
                    column?.nextCursor != null ? (
                      <ColumnLoadMore
                        req={req}
                        status={status}
                        nearEnd={nearEnd}
                        remaining={Math.max(
                          0,
                          column.count - column.rows.length
                        )}
                      />
                    ) : null
                  }
                />
              )
            })}
          </Reorder.Group>
        )}
      </motion.div>
    </BoardKeyboardContext>
  )
}

type BoardColumn = Readonly<{
  status: string
  rows: ReadonlyArray<TicketRow>
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
  nearEnd,
  remaining
}: Readonly<{
  req: BacklogRequest
  status: TicketStatus
  nearEnd: boolean
  remaining: number
}>) {
  const loadMore = useAtomSet(loadMoreBacklog({ req, status }))
  const loadMoreState = useAtomValue(loadMoreBacklog({ req, status }))
  const failed = Result.isFailure(loadMoreState)
  const idle = !loadMoreState.waiting && !failed

  useEffect(() => {
    if (nearEnd && idle) loadMore()
  }, [nearEnd, idle, loadMore])

  return (
    <>
      <AsyncView
        result={loadMoreState}
        contained
        reset={() => loadMore()}
        onInitial={() => null}
        onSuccess={() => null}
      />
      {failed && (
        <Button
          type="button"
          variant="tertiary"
          size="sm"
          onClick={() => loadMore()}
        >
          {m.tickets_section_load_more_button({ remaining })}
        </Button>
      )}
    </>
  )
}
