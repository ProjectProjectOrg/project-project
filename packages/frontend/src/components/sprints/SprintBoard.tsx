import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import {
  pendingTicketStatusAtom,
  placeTicketAtom,
  sprintKey
} from "@/atoms/sprints"
import {
  ticketsInSprintAtom,
  ticketsInSprintKey
} from "@/atoms/tickets"
import type {
  GroupId,
  Member,
  Ticket,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
import { cn } from "@/lib/utils"
import {
  BOARD_STATUSES,
  groupTicketsByStatus,
  type CardDropData,
  type ColumnDropData,
  type DragData
} from "./board-utils"
import { SprintBoardColumn } from "./SprintBoardColumn"

const BOARD_BOTTOM_OFFSET = 56

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

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setHeight(
        Math.max(240, window.innerHeight - rect.top - BOARD_BOTTOM_OFFSET)
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(document.body)
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

  const key = sprintKey(orgSlug, slug, groupId)
  const list = useAtomValue(
    ticketsInSprintAtom(ticketsInSprintKey(orgSlug, slug, groupId))
  )
  const overlay = useAtomValue(pendingTicketStatusAtom(key))
  const place = useAtomSet(placeTicketAtom(key))

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
    () => groupTicketsByStatus(ticketIds, ticketById, overlay),
    [ticketIds, ticketById, overlay]
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
        let nextStatus: TicketStatus
        if (dst.type === "card") {
          nextStatus = dst.status
          const inColumn = current[dst.status]
          const idx = inColumn.findIndex((t) => t.id === dst.id)
          if (dst.edge === "bottom") {
            after = dst.id
          } else {
            after = idx > 0 ? inColumn[idx - 1].id : null
          }
        } else {
          nextStatus = dst.status
          const inColumn = current[dst.status]
          after = inColumn.length > 0 ? inColumn[inColumn.length - 1].id : null
        }
        if (after === src.id) return
        const status = nextStatus !== src.status ? nextStatus : undefined
        place({ ticketId: src.id, status, after })
        flash(src.id)
      }
    })
    return () => {
      cleanupAutoScroll()
      cleanupMonitor()
    }
  }, [isCompleted, place])

  return (
    <div
      ref={ref}
      style={{ height: height ? `${height}px` : undefined }}
      className={cn(
        "overflow-x-auto pb-4",
        hasRightOverflow &&
          "[mask-image:linear-gradient(to_right,black_calc(100%-16px),transparent)]"
      )}
    >
      <div className="flex h-full gap-3">
        {BOARD_STATUSES.map((status) => (
          <SprintBoardColumn
            key={status}
            orgSlug={orgSlug}
            slug={slug}
            status={status}
            tickets={grouped[status]}
            members={members}
            isDraggable={!isCompleted}
            overlay={overlay}
            lastFlash={lastFlash}
          />
        ))}
        {GHOST_COLUMNS.map((name) => (
          <GhostColumn key={name} name={name} />
        ))}
      </div>
    </div>
  )
}

const GHOST_COLUMNS = ["backlog", "in review", "blocked", "canceled"]

function GhostColumn({ name }: { name: string }) {
  return (
    <div className="flex max-h-full w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-dashed border-border bg-background/40">
      <div className="flex items-center justify-between px-6 pt-3 pb-2">
        <span className="text-sm font-medium text-muted-foreground">
          {name}
        </span>
        <span className="font-mono text-xs text-muted-foreground tabular-nums">
          0
        </span>
      </div>
    </div>
  )
}
