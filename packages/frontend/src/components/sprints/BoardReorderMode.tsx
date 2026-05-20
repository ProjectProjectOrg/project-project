import { useEffect, useRef } from "react"
import { generateKeyBetween } from "fractional-indexing"
import { monitorForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter"
import type { ProjectStatus } from "@projectproject/shared"
import type { ColumnDragData, ColumnReorderDropData } from "./board-utils"
import { boardStatusesFor } from "./board-utils"

export function useLongPress(
  onLongPress: () => void,
  delay = 500,
  moveThreshold = 6
) {
  const timeoutRef = useRef<number | null>(null)
  const startRef = useRef<{ x: number; y: number } | null>(null)

  const clear = () => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    startRef.current = null
  }

  return {
    onPointerDown: (e: React.PointerEvent) => {
      startRef.current = { x: e.clientX, y: e.clientY }
      timeoutRef.current = window.setTimeout(() => {
        onLongPress()
        clear()
      }, delay)
    },
    onPointerMove: (e: React.PointerEvent) => {
      if (!startRef.current) return
      const dx = e.clientX - startRef.current.x
      const dy = e.clientY - startRef.current.y
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) clear()
    },
    onPointerUp: clear,
    onPointerCancel: clear,
    onPointerLeave: clear
  }
}

export function useColumnReorderMonitor({
  reorderMode,
  statuses,
  onReorder
}: {
  reorderMode: boolean
  statuses: ReadonlyArray<ProjectStatus>
  onReorder: (statusSlug: string, orderKey: string) => void
}) {
  const statusesRef = useRef(statuses)
  statusesRef.current = statuses

  useEffect(() => {
    if (!reorderMode) return
    return monitorForElements({
      onDrop({ source, location }) {
        const target = location.current.dropTargets[0]
        if (!target) return
        const src = source.data as unknown as ColumnDragData
        const dst = target.data as unknown as ColumnReorderDropData
        if (src.type !== "column-reorder") return
        if (dst.type !== "column-reorder-target") return
        if (src.slug === dst.slug) return

        const current = statusesRef.current
        const ordered = boardStatusesFor(current)
        const insertAt =
          dst.edge === "left"
            ? ordered.indexOf(dst.slug)
            : ordered.indexOf(dst.slug) + 1

        const filtered = ordered.filter((s) => s !== src.slug)
        const prevSlug = filtered[insertAt - 1] ?? null
        const nextSlug = filtered[insertAt] ?? null

        const prevKey = prevSlug
          ? (current.find((s) => s.slug === prevSlug)?.orderKey ?? null)
          : null
        const nextKey = nextSlug
          ? (current.find((s) => s.slug === nextSlug)?.orderKey ?? null)
          : null

        const newKey = generateKeyBetween(prevKey, nextKey)
        onReorder(src.slug, newKey)
      }
    })
  }, [reorderMode, onReorder])
}
