import {
  RegistryContext,
  useAtomSet,
  useAtomValue,
  useAtomRefresh
} from "@effect/atom-react"
import { GroupPolicy, TicketPolicy } from "@pp/access/policies"
import type {
  GroupId,
  Member,
  ProjectStatus,
  TicketId,
  TicketListQuery
} from "@pp/shared"
import {
  BoardColumns,
  useBoardAutoScroll,
  useBoardCardDrop
} from "@pp/ui/board-drag"
import { DitherShell } from "@pp/ui/dither-shell"
import { cn } from "@pp/ui/lib/utils"
import { HotkeysProvider } from "@tanstack/react-hotkeys"
import * as DateTime from "effect/DateTime"
import * as Result from "effect/reactivity/AsyncResult"
import { motion } from "motion/react"
import { useContext, useMemo, useRef, useState } from "react"

import { projectScope } from "@/api/keys"
import { AsyncView } from "@/components/shell/AsyncView"
import {
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  boardRequest,
  boardTicketUpdates,
  quickCreateBoardTicket,
  sprintBoard,
  updateBoardTicket,
  type BoardRequest,
  type BoardValue
} from "@/features/sprints/atoms/sprintBoard"
import {
  BoardKeyboardContext,
  useBoardKeyboardNavigation
} from "@/features/sprints/hooks/useBoardKeyboardNavigation"
import type { StatusReorder } from "@/features/sprints/hooks/useStatusReorder"
import { encodeTicketListQuery } from "@/features/tickets/atoms/backlog"
import { createdKeys } from "@/features/tickets/atoms/ticketRows"
import { useExpandSubTicketsCommand } from "@/features/tickets/components/ticket-list/useExpandSubTicketsCommand"
import { useBoardSubTicketsSettled } from "@/features/tickets/components/ticket-list/useSubTicketsSettled"
import { useProjectActor } from "@/hooks/useActor"
import { m } from "@/paraglide/messages"

import { useBoardColumns } from "../hooks/useBoardColumns"
import { useBoardDraft } from "../hooks/useBoardDraft"
import { useBoardTickets } from "../hooks/useBoardTickets"
import { useBoardViewport } from "../hooks/useBoardViewport"
import { visibleColumns } from "../lib/boardColumns"
import {
  boardStatusesFor,
  boardEdit,
  boardMove,
  groupTicketsByStatus,
  DropData,
  isDragData,
  isDropData
} from "../lib/boardUtils"
import { createdTicketShows } from "../lib/inlineCreate"
import { HiddenColumnsEmpty } from "./HiddenColumnsEmpty"
import { columnReorder, SprintBoardColumn } from "./SprintBoardColumn"

type SprintBoardProps = {
  groupId: GroupId
  query: TicketListQuery
  members: ReadonlyArray<Member>
  isCompleted: boolean
  // Reordering the columns by their grips; null for people who can't.
  reorder: StatusReorder | null
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
  reorder,
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
  const reorderMode = reorder?.reorderMode ?? false
  const dragOrder = reorder?.dragOrder ?? null
  const actor = useProjectActor()
  const canReorder = TicketPolicy.canChange(actor, { content: true })
  const canTransition = TicketPolicy.canChange(actor, { status: true })
  const keys = useAtomValue(createdKeys(projectScope(orgSlug, slug)))
  const pendingIds = useMemo(
    () =>
      new Set(
        board.tickets
          .filter((ticket) => ticket.creationKey !== undefined)
          .map((ticket) => ticket.id)
      ),
    [board.tickets]
  )
  const draft = useBoardDraft()
  const createTicket = useAtomSet(quickCreateBoardTicket(req), {
    mode: "promiseExit"
  })
  const canCreate =
    !isCompleted &&
    actor.call("tickets", "quickCreate") &&
    GroupPolicy.can(actor, "sprint", "add_ticket")
  const columnCreate = (status: ProjectStatus["slug"]) =>
    canCreate && (status === "todo" || canTransition)
      ? draft.forColumn(status, {
          submit: createTicket,
          insertable: true,
          showsInPlace: (input) =>
            createdTicketShows(
              query,
              input,
              DateTime.toDate(DateTime.nowUnsafe())
            )
        })
      : undefined
  const { height, hasRightOverflow } = useBoardViewport(ref)
  useBoardAutoScroll(ref, !isCompleted && !reorderMode && canReorder)

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
  const boardTicketsRef = useRef(board.tickets)
  boardTicketsRef.current = board.tickets

  useBoardCardDrop(!isCompleted && !reorderMode && canReorder, (src, dst) => {
    if (!isDragData(src) || !isDropData(dst)) return
    if (DropData.guards.card(dst) && dst.id === src.id) return

    const status = dst.status !== src.status ? dst.status : undefined
    if (status !== undefined && !canTransition) return
    const position = boardMove(
      boardTicketsRef.current,
      unfilteredGroupedRef.current[dst.status] ?? [],
      src.id,
      dst
    )
    const edit = boardEdit(status, position)
    if (edit === null) return
    registry.set(updateBoardTicket({ req, id: src.id }), edit)
    flash(src.id)
  })

  const keyboard = useBoardKeyboardNavigation(
    ref,
    !reorderMode && order.length > 0
  )

  return (
    <HotkeysProvider scope="board">
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
            <BoardColumns
              role={keyboard.context ? "row" : undefined}
              values={order}
              reordering={reorderMode}
              onReorder={(next) => reorder?.setDragOrder(next)}
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
                  reorder={columnReorder(reorder, order, status)}
                  collapsed={layout.collapsed.includes(status)}
                  onToggleCollapsed={() => layout.toggleCollapsed(status)}
                  create={columnCreate(status)}
                  inertTicketIds={pendingIds}
                  keyOf={(ticket: BoardValue["tickets"][number]) =>
                    ticket.creationKey ?? keys.get(ticket.id) ?? ticket.id
                  }
                />
              ))}
            </BoardColumns>
          )}
        </motion.div>
      </BoardKeyboardContext>
    </HotkeysProvider>
  )
}
