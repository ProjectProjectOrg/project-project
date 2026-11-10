import { useState } from "react"

import type { RowFilter } from "@/features/jira/lib/setup"

type RowFilterState = Readonly<{
  filter: RowFilter
  pinned: ReadonlySet<number>
}>

export type RowFilterControls = Readonly<{
  filter: RowFilter
  setFilter: (filter: RowFilter) => void
  pinned: (index: number) => boolean
}>

export function useRowFilter(
  count: number,
  needsAttention: (index: number) => boolean
): RowFilterControls {
  const snapshot = (): ReadonlySet<number> =>
    new Set(
      Array.from({ length: count }, (_, index) => index).filter(needsAttention)
    )
  const [state, setState] = useState<RowFilterState>(() => {
    const pinned = snapshot()
    return { filter: { query: "", attentionOnly: pinned.size > 0 }, pinned }
  })
  return {
    filter: state.filter,
    setFilter: (filter) =>
      setState((previous) => ({
        filter,
        pinned:
          filter.attentionOnly && !previous.filter.attentionOnly
            ? snapshot()
            : previous.pinned
      })),
    pinned: (index) => state.pinned.has(index)
  }
}
