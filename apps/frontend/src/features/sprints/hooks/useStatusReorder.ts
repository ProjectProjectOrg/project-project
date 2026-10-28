import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { StatusSlug } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { useCallback, useState } from "react"

import {
  dispatchStatusReorders,
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"
import {
  boardReorders,
  keepsBaselineOrder
} from "@/features/statuses/lib/statusPhases"

export type StatusReorder = Readonly<{
  reorderMode: boolean
  dragOrder: ReadonlyArray<StatusSlug> | null
  enterReorder: () => void
  cancelReorder: () => void
  setDragOrder: (next: ReadonlyArray<StatusSlug> | null) => void
  saveReorder: () => void
}>

export function useStatusReorder(
  orgSlug: string,
  slug: string,
  scopeKey: string
): StatusReorder {
  const [reorder, setReorder] = useState<{
    key: string
    order: ReadonlyArray<StatusSlug> | null
  } | null>(null)
  if (reorder !== null && reorder.key !== scopeKey) setReorder(null)

  const statusReq = statusesRequest(orgSlug, slug)
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const reorderStatuses = useAtomSet(dispatchStatusReorders(statusReq))

  const dragOrder = reorder?.order ?? null

  const enterReorder = useCallback(
    () => setReorder({ key: scopeKey, order: null }),
    [scopeKey]
  )

  const cancelReorder = useCallback(() => setReorder(null), [])

  const setDragOrder = useCallback(
    (next: ReadonlyArray<StatusSlug> | null) => {
      if (next !== null && !keepsBaselineOrder(next)) return
      setReorder({ key: scopeKey, order: next })
    },
    [scopeKey]
  )

  const saveReorder = useCallback(() => {
    if (!Result.isSuccess(statusesResult)) return
    const statuses = statusesResult.value
    if (dragOrder && statuses.length > 0)
      reorderStatuses(boardReorders(dragOrder, statuses))
    setReorder(null)
  }, [dragOrder, reorderStatuses, statusesResult])

  return {
    reorderMode: reorder !== null,
    dragOrder,
    enterReorder,
    cancelReorder,
    setDragOrder,
    saveReorder
  }
}

export const ignoreReorder = () => {}
