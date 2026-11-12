import { RegistryContext } from "@effect/atom-react"
import type { TicketListQuery } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { use, useEffect, useMemo } from "react"

import {
  viewCounts,
  type ViewCountsSource
} from "@/features/tickets/atoms/viewCounts"

export function useFilterPrefetch({
  orgSlug,
  slug,
  groupId,
  view,
  grouping
}: Omit<ViewCountsSource, "query">): (query: TicketListQuery) => void {
  const registry = use(RegistryContext)
  const resource = useMemo(() => {
    const pending = new Map<ReturnType<typeof viewCounts>, () => void>()
    const queued = new Set<ReturnType<typeof viewCounts>>()
    const warm = (target: ReturnType<typeof viewCounts>) => {
      if (pending.has(target)) {
        queued.clear()
        return
      }
      if (pending.size >= 2) {
        queued.clear()
        queued.add(target)
        return
      }
      const finish = () => {
        pending.get(target)?.()
        pending.delete(target)
        const next = queued.values().next().value
        queued.clear()
        if (next) warm(next)
      }
      const release = registry.subscribe(target, (result) => {
        if (!Result.isInitial(result) && !result.waiting) finish()
      })
      pending.set(target, release)
      const result = registry.get(target)
      if (!Result.isInitial(result) && !result.waiting) finish()
    }
    return {
      prefetch: (query: TicketListQuery) => {
        if (view !== "description")
          warm(viewCounts({ orgSlug, slug, groupId, view, grouping, query }))
      },
      dispose: () => {
        queued.clear()
        for (const release of pending.values()) release()
        pending.clear()
      }
    }
  }, [registry, orgSlug, slug, groupId, view, grouping])
  useEffect(() => resource.dispose, [resource])
  return resource.prefetch
}
