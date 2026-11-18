import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StatusSlug } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useCallback, useRef, useState } from "react"

import {
  dispatchStatusReorders,
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  boardReorders,
  keepsBaselineOrder
} from "@/features/statuses/lib/statusPhases"

import { boardStatusesFor } from "../lib/boardUtils"

// Reordering a board's columns by their grips: pressing one starts a drag
// (reorderMode is true while it lasts), the columns follow as dragOrder,
// and letting go saves the new order. The grip's arrow keys move a column
// one place and save at once.
export type StatusReorder = Readonly<{
  reorderMode: boolean
  dragOrder: ReadonlyArray<StatusSlug> | null
  enterReorder: () => void
  setDragOrder: (next: ReadonlyArray<StatusSlug> | null) => void
  saveReorder: () => void
  moveStatus: (
    visible: ReadonlyArray<StatusSlug>,
    status: StatusSlug,
    delta: -1 | 1
  ) => void
}>

export function useStatusReorder(
  orgSlug: string,
  slug: string,
  scopeKey: string
) {
  const [reorder, setReorder] = useState<{
    key: string
    order: ReadonlyArray<StatusSlug> | null
  } | null>(null)
  if (reorder !== null && reorder.key !== scopeKey) setReorder(null)
  // saveReorder runs from the pointer-up of a drag that began renders ago,
  // so it reads the order from here, not from its closure.
  const latest = useRef<ReadonlyArray<StatusSlug> | null>(null)

  const statusReq = statusesRequest(orgSlug, slug)
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const reorderStatuses = useAtomSet(dispatchStatusReorders(statusReq))

  const dragOrder = reorder?.order ?? null

  const enterReorder = useCallback(() => {
    latest.current = null
    setReorder({ key: scopeKey, order: null })
  }, [scopeKey])

  const allowed = useCallback(
    (next: ReadonlyArray<StatusSlug>) => {
      const all = Result.isSuccess(statusesResult)
        ? boardStatusesFor(statusesResult.value)
        : next
      return keepsBaselineOrder(withHiddenInPlace(all, next))
    },
    [statusesResult]
  )

  const setDragOrder = useCallback(
    (next: ReadonlyArray<StatusSlug> | null) => {
      if (next !== null && !allowed(next)) return
      latest.current = next
      setReorder({ key: scopeKey, order: next })
    },
    [scopeKey, allowed]
  )

  const save = useCallback(
    (order: ReadonlyArray<StatusSlug> | null) => {
      if (!Result.isSuccess(statusesResult)) return
      const statuses = statusesResult.value
      if (order && statuses.length > 0)
        reorderStatuses(
          boardReorders(
            withHiddenInPlace(boardStatusesFor(statuses), order),
            statuses
          )
        )
    },
    [reorderStatuses, statusesResult]
  )

  const saveReorder = useCallback(() => {
    save(latest.current)
    latest.current = null
    setReorder(null)
  }, [save])

  const moveStatus = useCallback(
    (visible: ReadonlyArray<StatusSlug>, status: StatusSlug, delta: -1 | 1) => {
      const from = visible.indexOf(status)
      const to = from + delta
      if (from < 0 || to < 0 || to >= visible.length) return
      const next = [...visible]
      next.splice(from, 1)
      next.splice(to, 0, status)
      if (allowed(next)) save(next)
    },
    [allowed, save]
  )

  return {
    reorderMode: reorder !== null,
    dragOrder,
    enterReorder,
    setDragOrder,
    saveReorder,
    moveStatus
  }
}

function withHiddenInPlace(
  all: ReadonlyArray<StatusSlug>,
  visible: ReadonlyArray<StatusSlug>
) {
  const known = new Set(all)
  const moved = visible.filter((s) => known.has(s))
  const movedSet = new Set(moved)
  let next = 0
  return all.map((s) => (movedSet.has(s) ? moved[next++] : s))
}
