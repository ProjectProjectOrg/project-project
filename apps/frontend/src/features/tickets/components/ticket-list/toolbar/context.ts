import type {
  EstimationMode,
  Member,
  TicketFilter,
  TicketListQuery
} from "@pp/shared"
import { createContext, use, type ReactNode } from "react"

import type { BoardScope } from "@/features/sprints/hooks/useBoardColumns"

import type { FilterDimension } from "./model"

export type TicketToolbarProps = Readonly<{
  leading?: ReactNode
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  onQueryPrefetch: (query: TicketListQuery) => void
  members: ReadonlyArray<Member>
  counts: Record<string, number> | null
  filters: ReadonlyArray<FilterDimension>
  estimation: EstimationMode
  viewControls?: ReactNode
  showSort?: boolean
  boardScope?: BoardScope
}>

type TicketToolbarContextValue = Omit<
  TicketToolbarProps,
  "showSort" | "leading"
> &
  Readonly<{
    compact: boolean
    patchFilter: (patch: Partial<TicketFilter>) => void
    prefetchFilter: (patch: Partial<TicketFilter>) => void
    clearAll: () => void
    hasActiveFilters: boolean
  }>

export const TicketToolbarContext =
  createContext<TicketToolbarContextValue | null>(null)

export function useTicketToolbar() {
  const context = use(TicketToolbarContext)
  if (!context)
    throw new Error("Toolbar controls must render inside TicketToolbar")
  return context
}
