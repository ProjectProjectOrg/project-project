import * as Result from "effect/unstable/reactivity/AsyncResult"
import { useAtomSet, useAtomValue } from "@effect/atom-react"
import { generateKeyBetween } from "fractional-indexing"
import { useCallback, useState } from "react"
import {
  projectKey as projectStatusKey,
  projectStatusesAtom,
  reorderStatusAtom
} from "@/atoms/projectStatuses"

export type StatusReorder = {
  readonly reorderMode: boolean
  readonly dragOrder: ReadonlyArray<string> | null
  readonly enterReorder: () => void
  readonly cancelReorder: () => void
  readonly setDragOrder: (next: ReadonlyArray<string> | null) => void
  readonly saveReorder: () => void
}

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

  const statusKey = projectStatusKey(orgSlug, slug)
  const statusesResult = useAtomValue(projectStatusesAtom(statusKey))
  const reorderStatus = useAtomSet(reorderStatusAtom(statusKey))

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
      const keys = new Map<string, string>(
        statuses.map((s) => [s.slug as string, s.orderKey as string])
      )
      let lastKey: string | null = null
      for (let i = 0; i < dragOrder.length; i++) {
        const slug = dragOrder[i]
        const myKey = keys.get(slug)
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
        keys.set(slug, newKey)
        reorderStatus({ statusSlug: slug, orderKey: newKey })
        lastKey = newKey
      }
    }
    setReorder(null)
  }, [dragOrder, statusesResult, reorderStatus])

  return {
    reorderMode: reorder !== null,
    dragOrder,
    enterReorder,
    cancelReorder,
    setDragOrder,
    saveReorder
  }
}
