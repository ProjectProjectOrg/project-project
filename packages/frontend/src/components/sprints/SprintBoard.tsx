import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import {
  pendingTicketStatusAtom,
  placeTicketAtom,
  sprintKey
} from "@/atoms/sprints"
import { ticketsInSprintAtom, ticketsInSprintKey } from "@/atoms/tickets"
import {
  projectKey as projectStatusKey,
  projectStatusesAtom,
  reorderStatusAtom
} from "@/atoms/projectStatuses"
import type {
  GroupId,
  Member,
  Ticket,
  TicketId
} from "@projectproject/shared"
import { cn } from "@/lib/utils"
import {
  boardStatusesFor,
  groupTicketsByStatus,
  type CardDropData,
  type ColumnDropData,
  type DragData
} from "./board-utils"
import { SprintBoardColumn } from "./SprintBoardColumn"
import { useLongPress, useColumnReorderMonitor } from "./BoardReorderMode"

export function SprintBoard({
  orgSlug,
  slug,
  groupId,
  ticketIds,
  members,
  isCompleted
}: {
  orgSlug: string
  slug: string
  groupId: GroupId
  ticketIds: ReadonlyArray<TicketId>
  members: ReadonlyArray<Member>
  isCompleted: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [height, setHeight] = useState<number | null>(null)
  const [hasRightOverflow, setHasRightOverflow] = useState(true)
  const [reorderMode, setReorderMode] = useState(false)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const scrollRoot = el.closest("[data-scroll-root]")
    const scrollContent = el.closest("[data-scroll-content]")
    const container =
      scrollRoot instanceof HTMLElement ? scrollRoot : document.body
    const paddingSource =
      scrollContent instanceof HTMLElement ? scrollContent : container
    const update = () => {
      const rect = el.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()
      const style = window.getComputedStyle(paddingSource)
      const paddingBottom = Number.parseFloat(style.paddingBottom) || 0
      setHeight(Math.max(240, containerRect.bottom - rect.top - paddingBottom))
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    window.addEventListener("resize", update)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
    }
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      setHasRightOverflow(el.scrollLeft + el.clientWidth < el.scrollWidth - 1)
    }
    update()
    el.addEventListener("scroll", update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => {
      el.removeEventListener("scroll", update)
      ro.disconnect()
    }
  }, [])

  useEffect(() => {
    if (!reorderMode) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setReorderMode(false)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [reorderMode])

  const key = sprintKey(orgSlug, slug, groupId)
  const statusKey = projectStatusKey(orgSlug, slug)
  const list = useAtomValue(
    ticketsInSprintAtom(ticketsInSprintKey(orgSlug, slug, groupId))
  )
  const overlay = useAtomValue(pendingTicketStatusAtom(key))
  const place = useAtomSet(placeTicketAtom(key))
  const reorder = useAtomSet(reorderStatusAtom(statusKey))
  const statusesResult = useAtomValue(projectStatusesAtom(statusKey))
  const statuses = Result.isSuccess(statusesResult) ? statusesResult.value : []
  const statusSlugs = boardStatusesFor(statuses)

  const [lastFlash, setLastFlash] = useState<{
    id: TicketId
    tick: number
  } | null>(null)
  const flash = (id: TicketId) =>
    setLastFlash((prev) => ({ id, tick: (prev?.tick ?? 0) + 1 }))

  const ticketById = useMemo(() => {
    const m = new Map<TicketId, Ticket>()
    if (Result.isSuccess(list)) {
      for (const t of list.value) m.set(t.id, t)
    }
    return m
  }, [list])

  const grouped = useMemo(
    () => groupTicketsByStatus(ticketIds, ticketById, overlay, statusSlugs),
    [ticketIds, ticketById, overlay, statusSlugs]
  )
  const groupedRef = useRef(grouped)
  groupedRef.current = grouped

  useEffect(() => {
    const el = ref.current
    if (!el || isCompleted) return
    const cleanupAutoScroll = autoScrollForElements({ element: el })
    const cleanupMonitor = monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data as unknown as DragData
        const dst = target.data as unknown as CardDropData | ColumnDropData
        if (src.type !== "card") return
        if (dst.type === "card" && dst.id === src.id) return

        const current = groupedRef.current
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
          nextStatus !== src.status
            ? (nextStatus as import("@projectproject/shared").TicketStatus)
            : undefined
        place({ ticketId: src.id, status, after })
        flash(src.id)
      }
    })
    return () => {
      cleanupAutoScroll()
      cleanupMonitor()
    }
  }, [isCompleted, place])

  const handleReorder = useCallback(
    (statusSlug: string, orderKey: string) => {
      reorder({ statusSlug, orderKey })
      setReorderMode(false)
    },
    [reorder]
  )

  useColumnReorderMonitor({
    reorderMode,
    statuses,
    onReorder: handleReorder
  })

  const enterReorderMode = useCallback(() => {
    if (!isCompleted) setReorderMode(true)
  }, [isCompleted])

  const longPressHandlers = useLongPress(enterReorderMode)

  const onBoardClick = (e: React.MouseEvent) => {
    if (!reorderMode) return
    const isHeader = (e.target as HTMLElement).closest("[data-column-header]")
    if (!isHeader) setReorderMode(false)
  }

  return (
    <div
      ref={ref}
      style={{ height: height ? `${height}px` : undefined }}
      className={cn(
        "overflow-x-auto pb-4",
        hasRightOverflow &&
          "[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
      )}
      onClick={onBoardClick}
    >
      <div className="flex h-full gap-3">
        {statusSlugs.map((status) => (
          <SprintBoardColumn
            key={status}
            orgSlug={orgSlug}
            slug={slug}
            status={status}
            statuses={statuses}
            tickets={grouped[status] ?? []}
            members={members}
            isDraggable={!isCompleted}
            overlay={overlay}
            lastFlash={lastFlash}
            reorderMode={reorderMode}
            longPressHandlers={longPressHandlers}
          />
        ))}
      </div>
    </div>
  )
}
