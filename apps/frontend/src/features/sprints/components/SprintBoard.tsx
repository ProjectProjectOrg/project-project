import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import {
  RegistryContext,
  useAtomValue,
  useAtomRefresh
} from "@effect/atom-react"
import { GroupPolicy, TicketPolicy } from "@pp/access/policies"
import type {
  GroupId,
  Member,
  ProjectStatus,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { motion, Reorder } from "motion/react"
import { useContext, useEffect, useMemo, useRef, useState } from "react"

import { fireMutation } from "@/api/viewMutation"
import { AsyncView } from "@/components/shell/AsyncView"
import { DitherShell } from "@/components/ui/dither-shell"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  boardRequest,
  boardTicketUpdates,
  placeBoardTicket,
  sprintBoard,
  type BoardRequest,
  type BoardValue
} from "@/features/sprints/atoms/sprintBoard"
import {
  BoardKeyboardContext,
  useBoardKeyboardNavigation
} from "@/features/sprints/hooks/useBoardKeyboardNavigation"
import { useHorizontalAutoScroll } from "@/features/sprints/hooks/useHorizontalAutoScroll"
import { useReorderMode } from "@/features/sprints/hooks/useReorderMode"
import { encodeTicketListQuery } from "@/features/tickets/atoms/backlog"
import { useExpandSubTicketsCommand } from "@/features/tickets/components/ticket-list/useExpandSubTicketsCommand"
import { useBoardSubTicketsSettled } from "@/features/tickets/components/ticket-list/useSubTicketsSettled"
import { useProjectActor } from "@/hooks/useActor"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

import { useBoardColumns } from "../hooks/useBoardColumns"
import { useBoardTickets } from "../hooks/useBoardTickets"
import { useBoardViewport } from "../hooks/useBoardViewport"
import { visibleColumns } from "../lib/boardColumns"
import {
  boardStatusesFor,
  groupTicketsByStatus,
  isDragData,
  isDropData
} from "../lib/boardUtils"
import { HiddenColumnsEmpty } from "./HiddenColumnsEmpty"
import { SprintBoardColumn } from "./SprintBoardColumn"

type SprintBoardProps = {
  groupId: GroupId
  query: TicketListQuery
  members: ReadonlyArray<Member>
  isCompleted: boolean
  reorderMode: boolean
  onEnterReorder: () => void
  onExitReorder: () => void
  dragOrder: ReadonlyArray<TicketStatus> | null
  setDragOrder: (next: ReadonlyArray<TicketStatus> | null) => void
}

export function SprintBoard(props: SprintBoardProps) {
  const { orgSlug, slug } = useProjectRoute()
  const { groupId } = props
  const req = useMemo(
    () => boardRequest(orgSlug, slug, groupId),
    [orgSlug, slug, groupId]
  )
  const board = useAtomValue(sprintBoard(req))
  const statusReq = statusesRequest(orgSlug, slug)
  const statuses = useAtomValue(statusesFor(statusReq))
  const refreshBoard = useAtomRefresh(sprintBoard(req))
  const refreshStatuses = useAtomRefresh(statusesFor(statusReq))
  const subTicketsSettled = useBoardSubTicketsSettled(
    Result.isSuccess(board) ? board.value.tickets : null
  )
  const loading = (
    <DitherShell contained animated>
      {null}
    </DitherShell>
  )
  const refresh = () => {
    if (Result.isFailure(board)) refreshBoard()
    if (Result.isFailure(statuses)) refreshStatuses()
  }

  return (
    <AsyncView
      result={Result.all({ board, statuses })}
      contained
      reset={refresh}
      onInitial={() => loading}
      onSuccess={({ value, waiting }) =>
        subTicketsSettled ? (
          <SprintBoardContent
            {...props}
            req={req}
            board={value.board}
            statuses={value.statuses}
            waiting={waiting}
          />
        ) : (
          loading
        )
      }
    />
  )
}

function SprintBoardContent({
  req,
  query,
  members,
  isCompleted,
  reorderMode,
  onEnterReorder,
  onExitReorder,
  dragOrder,
  setDragOrder,
  board,
  statuses,
  waiting
}: SprintBoardProps & {
  req: BoardRequest
  board: BoardValue
  statuses: ReadonlyArray<ProjectStatus>
  waiting: boolean
}) {
  useExpandSubTicketsCommand()
  const { orgSlug, slug } = useProjectRoute()
  const ref = useRef<HTMLDivElement>(null)
  const groupRef = useReorderMode(reorderMode, onExitReorder)
  const actor = useProjectActor()
  const canReorder = GroupPolicy.can(actor, "sprint", "reorder")
  const canTransition = TicketPolicy.canChange(actor, { status: true })
  const { height, hasRightOverflow } = useBoardViewport(ref)
  useHorizontalAutoScroll(ref, !isCompleted && !reorderMode && canReorder)

  const registry = useContext(RegistryContext)
  const statusSlugs = useMemo(() => boardStatusesFor(statuses), [statuses])

  const layout = useBoardColumns("sprints")
  const order = visibleColumns(dragOrder ?? statusSlugs, layout.hidden)

  const [lastFlash, setLastFlash] = useState<{
    id: TicketId
    tick: number
  } | null>(null)
  const flash = (id: TicketId) =>
    setLastFlash((prev) => ({ id, tick: (prev?.tick ?? 0) + 1 }))

  const { visibleTickets } = useBoardTickets(
    orgSlug,
    slug,
    board.tickets,
    query
  )

  const grouped = useMemo(
    () => groupTicketsByStatus(visibleTickets, statusSlugs),
    [visibleTickets, statusSlugs]
  )
  const unfilteredGrouped = useMemo(
    () => groupTicketsByStatus(board.tickets, statusSlugs),
    [board.tickets, statusSlugs]
  )
  const unfilteredGroupedRef = useRef(unfilteredGrouped)
  unfilteredGroupedRef.current = unfilteredGrouped

  useEffect(() => {
    const el = ref.current
    if (!el || isCompleted || reorderMode || !canReorder) return
    return monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data
        const dst = target.data
        if (!isDragData(src) || !isDropData(dst)) return
        if (dst.type === "card" && dst.id === src.id) return

        const current = unfilteredGroupedRef.current
        let after: TicketId | null
        let nextStatus: TicketStatus
        if (dst.type === "card") {
          nextStatus = dst.status
          const inColumn = current[dst.status] ?? []
          const idx = inColumn.findIndex((t) => t.id === dst.id)
          if (dst.edge === "bottom") {
            after = dst.id
          } else {
            after = idx > 0 ? inColumn[idx - 1].id : null
          }
        } else {
          nextStatus = dst.status
          const inColumn = current[dst.status] ?? []
          after = inColumn.length > 0 ? inColumn[inColumn.length - 1].id : null
        }
        if (after === src.id) return
        const status = nextStatus !== src.status ? nextStatus : undefined
        if (status !== undefined && !canTransition) return
        void fireMutation(registry, placeBoardTicket({ req, id: src.id }), {
          ticketId: src.id,
          status,
          after
        })
        flash(src.id)
      }
    })
  }, [canReorder, canTransition, isCompleted, reorderMode, req, registry])

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
        aria-busy={waiting}
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
            {order.map((status, columnIndex) => (
              <SprintBoardColumn
                key={status}
                columnIndex={columnIndex}
                update={boardTicketUpdates(req)}
                status={status}
                statuses={statuses}
                tickets={grouped[status] ?? []}
                filterKey={encodeTicketListQuery(query)}
                members={members}
                isDraggable={!isCompleted && canReorder}
                lastFlash={lastFlash}
                reorderMode={reorderMode}
                onActivateReorder={onEnterReorder}
                collapsed={layout.collapsed.includes(status)}
                onToggleCollapsed={() => layout.toggleCollapsed(status)}
              />
            ))}
          </Reorder.Group>
        )}
      </motion.div>
    </BoardKeyboardContext>
  )
}
