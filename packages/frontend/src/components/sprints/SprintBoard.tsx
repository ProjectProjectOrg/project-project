import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomValue, useAtomSet, useAtomRefresh } from "@effect/atom-react"
import { motion, Reorder } from "motion/react"
import { useEffect, useMemo, useRef, useState } from "react"
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import {
  boardRequest,
  placeBoardTicket,
  sprintBoard,
  type BoardRequest,
  type BoardValue
} from "@/atoms/sprintBoard"
import { statusesFor, statusesRequest } from "@/atoms/projectStatuses"
import type {
  GroupId,
  Member,
  ProjectStatus,
  TicketId,
  TicketListQuery,
  TicketStatus
} from "@projectproject/shared"
import { cn } from "@/lib/utils"
import {
  boardStatusesFor,
  groupTicketsByStatus,
  type CardDropData,
  type ColumnDropData,
  type DragData
} from "./board-utils"
import { ErrorPage } from "@/components/ErrorPage"
import { DitherShell } from "@/components/ui/dither-shell"
import { SprintBoardColumn } from "./SprintBoardColumn"
import { useBoardTickets } from "./useBoardTickets"
import { useBoardViewport } from "./useBoardViewport"

type SprintBoardProps = {
  orgSlug: string
  slug: string
  groupId: GroupId
  query: TicketListQuery
  members: ReadonlyArray<Member>
  isCompleted: boolean
  reorderMode: boolean
  onEnterReorder: () => void
  onExitReorder: () => void
  dragOrder: ReadonlyArray<string> | null
  setDragOrder: (next: ReadonlyArray<string> | null) => void
}

export function SprintBoard(props: SprintBoardProps) {
  const { orgSlug, slug, groupId } = props
  const req = useMemo(
    () => boardRequest(orgSlug, slug, groupId),
    [orgSlug, slug, groupId]
  )
  const board = useAtomValue(sprintBoard(req))
  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statuses = useAtomValue(statusesFor(statusReq))
  const refreshBoard = useAtomRefresh(sprintBoard(req))
  const refreshStatuses = useAtomRefresh(statusesFor(statusReq))
  const refresh = () => {
    if (Result.isFailure(board)) refreshBoard()
    if (Result.isFailure(statuses)) refreshStatuses()
  }

  return Result.matchWithError(Result.all({ board, statuses }), {
    onInitial: () => (
      <DitherShell contained animated>
        {null}
      </DitherShell>
    ),
    onError: (error) => <ErrorPage error={error} reset={refresh} contained />,
    onDefect: (defect) => (
      <ErrorPage error={defect} reset={refresh} contained />
    ),
    onSuccess: ({ value, waiting }) => (
      <SprintBoardContent
        {...props}
        req={req}
        board={value.board}
        statuses={value.statuses}
        waiting={waiting}
      />
    )
  })
}

function SprintBoardContent({
  orgSlug,
  slug,
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

  const place = useAtomSet(placeBoardTicket(req))
  const placeState = useAtomValue(placeBoardTicket(req))
  const statusSlugs = useMemo(() => boardStatusesFor(statuses), [statuses])

  const order = dragOrder ?? statusSlugs

  const [lastFlash, setLastFlash] = useState<{
    id: TicketId
    tick: number
  } | null>(null)
  const flash = (id: TicketId) =>
    setLastFlash((prev) => ({ id, tick: (prev?.tick ?? 0) + 1 }))

  const [dragTargetId, setDragTargetId] = useState<TicketId | null>(null)
  const pendingId = placeState.waiting ? dragTargetId : null

  const { matchingTickets } = useBoardTickets(
    orgSlug,
    slug,
    board.tickets,
    query
  )

  const grouped = useMemo(
    () => groupTicketsByStatus(matchingTickets, order),
    [matchingTickets, order]
  )
  const unfilteredGrouped = useMemo(
    () => groupTicketsByStatus(board.tickets, order),
    [board.tickets, order]
  )
  const unfilteredGroupedRef = useRef(unfilteredGrouped)
  unfilteredGroupedRef.current = unfilteredGrouped

  useEffect(() => {
    const el = ref.current
    if (!el || isCompleted || reorderMode) return
    const cleanupAutoScroll = autoScrollForElements({
      element: el,
      getAllowedAxis: () => "horizontal"
    })
    const cleanupMonitor = monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data as unknown as DragData
        const dst = target.data as unknown as CardDropData | ColumnDropData
        if (src.type !== "card") return
        if (dst.type === "card" && dst.id === src.id) return

        const current = unfilteredGroupedRef.current
        let after: TicketId | null
        let nextStatus: string
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
        const status =
          nextStatus !== src.status ? (nextStatus as TicketStatus) : undefined
        setDragTargetId(src.id)
        place({ ticketId: src.id, status, after })
        flash(src.id)
      }
    })
    return () => {
      cleanupAutoScroll()
      cleanupMonitor()
    }
  }, [isCompleted, reorderMode, place])

  return (
    <motion.div
      ref={ref}
      layoutScroll
      aria-busy={waiting}
      style={{ height: height ?? 240 }}
      className={cn(
        "overflow-x-auto",
        waiting && "animate-pulse motion-reduce:animate-none",
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
        {order.map((status) => (
          <SprintBoardColumn
            key={status}
            orgSlug={orgSlug}
            slug={slug}
            req={req}
            status={status}
            statuses={statuses}
            tickets={grouped[status] ?? []}
            members={members}
            isDraggable={!isCompleted}
            pendingId={pendingId}
            lastFlash={lastFlash}
            reorderMode={reorderMode}
            onActivateReorder={onEnterReorder}
          />
        ))}
      </Reorder.Group>
    </motion.div>
  )
}
