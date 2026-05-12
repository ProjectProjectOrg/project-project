import { Result, useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import { autoScrollForElements } from "@atlaskit/pragmatic-drag-and-drop-auto-scroll/element"
import {
  pendingTicketStatusAtom,
  placeTicketAtom,
  sprintKey
} from "@/atoms/sprints"
import { ticketsListAtom, ticketsListKey } from "@/atoms/tickets"
import type {
  GroupId,
  Member,
  Ticket,
  TicketId,
  TicketStatus
} from "@projectproject/shared"
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

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => {
      const rect = el.getBoundingClientRect()
      setHeight(Math.max(240, window.innerHeight - rect.top - BOARD_BOTTOM_OFFSET))
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

  const key = sprintKey(orgSlug, slug, groupId)
  const list = useAtomValue(ticketsListAtom(ticketsListKey(orgSlug, slug)))
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
      className="overflow-x-auto px-4 pb-4"
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
      </div>
    </div>
  )
}
