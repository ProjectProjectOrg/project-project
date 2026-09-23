import { useAtomSet, useAtomValue } from "@effect/atom-react"
import type { ProjectStatus, StatusSlug } from "@pp/shared"
import * as Result from "effect/unstable/reactivity/AsyncResult"
import { generateKeyBetween } from "fractional-indexing"
import { useCallback, useMemo, useState } from "react"

import {
  dispatchStatusReorders,
  statusesFor,
  statusesRequest
} from "@/features/projects/atoms/projectStatuses"

export type StatusReorder = Readonly<{
  reorderMode: boolean
  dragOrder: ReadonlyArray<string> | null
  enterReorder: () => void
  cancelReorder: () => void
  setDragOrder: (next: ReadonlyArray<string> | null) => void
  saveReorder: () => void
}>

export function useStatusReorder(
  orgSlug: string,
  slug: string,
  scopeKey: string
): StatusReorder {
  const [reorder, setReorder] = useState<{
    key: string
    order: ReadonlyArray<string> | null
  } | null>(null)
  if (reorder !== null && reorder.key !== scopeKey) setReorder(null)

  const statusReq = useMemo(
    () => statusesRequest(orgSlug, slug),
    [orgSlug, slug]
  )
  const statusesResult = useAtomValue(statusesFor(statusReq))
  const reorderStatuses = useAtomSet(dispatchStatusReorders(statusReq))

  const dragOrder = reorder?.order ?? null

  const enterReorder = useCallback(
    () => setReorder({ key: scopeKey, order: null }),
    [scopeKey]
  )

  const cancelReorder = useCallback(() => setReorder(null), [])

  const setDragOrder = useCallback(
    (next: ReadonlyArray<string> | null) =>
      setReorder({ key: scopeKey, order: next }),
    [scopeKey]
  )

  const saveReorder = useCallback(() => {
    if (!Result.isSuccess(statusesResult)) return
    const statuses = statusesResult.value
    if (dragOrder && statuses.length > 0) {
      const reorders: Array<{
        statusSlug: StatusSlug
        orderKey: ProjectStatus["orderKey"]
      }> = []
      const keys = new Map<string, string>(
        statuses.map((s) => [s.slug as string, s.orderKey as string])
      )
      let lastKey: string | null = null
      for (let i = 0; i < dragOrder.length; i++) {
        const columnSlug = dragOrder[i]
        const myKey = keys.get(columnSlug)
        if (!myKey) continue
        if (lastKey === null || myKey > lastKey) {
          lastKey = myKey
          continue
        }
        let nextValid: string | null = null
        for (let j = i + 1; j < dragOrder.length; j++) {
          const k = keys.get(dragOrder[j])
          if (k && k > lastKey) {
            nextValid = k
            break
          }
        }
        const newKey = generateKeyBetween(lastKey, nextValid)
        keys.set(columnSlug, newKey)
        reorders.push({
          statusSlug: columnSlug as StatusSlug,
          orderKey: newKey as ProjectStatus["orderKey"]
        })
        lastKey = newKey
      }
      reorderStatuses(reorders)
    }
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
