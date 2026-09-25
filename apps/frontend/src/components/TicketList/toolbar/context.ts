import type { Member, TicketFilter, TicketListQuery } from "@pp/shared"
import { createContext, use, type ReactNode } from "react"

import type { useTicketSearch } from "../search"
import type { FilterDimension } from "./model"

export type TicketToolbarProps = Readonly<{
  orgSlug: string
  slug: string
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  members: ReadonlyArray<Member>
  counts: Record<string, number>
  filters: ReadonlyArray<FilterDimension>
  scopeKey?: string
  viewOptionsVariant?: "legacy" | "panel"
  viewControls?: ReactNode
  showSort?: boolean
  children?: ReactNode
}>

type TicketToolbarContextValue = Omit<
  TicketToolbarProps,
  "showSort" | "children" | "viewOptionsVariant"
> &
  Readonly<{
    search: ReturnType<typeof useTicketSearch>
    searchActive: boolean
    controlsCompact: boolean
    setFocused: (focused: boolean) => void
    patchFilter: (patch: Partial<TicketFilter>) => void
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
