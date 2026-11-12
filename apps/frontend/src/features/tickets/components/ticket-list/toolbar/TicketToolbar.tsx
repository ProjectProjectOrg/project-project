import type { TicketFilter } from "@pp/shared"
import { useLayoutEffect, useRef, useState } from "react"

import { useTicketSearch } from "../search"
import { TicketToolbarContext, type TicketToolbarProps } from "./context"
import { Filters } from "./Filters"
import { activeFilterCount } from "./model"
import { ClearAll, SearchInput } from "./parts"
import { ViewOptions } from "./ViewOptions"

export function TicketToolbar({
  query,
  onQueryChange,
  members,
  counts,
  filters,
  estimation,
  showSort = false,
  scopeKey,
  viewControls,
  boardScope
}: TicketToolbarProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  const [focused, setFocused] = useState(false)
  const search = useTicketSearch(
    query.q,
    (q) => onQueryChange({ ...query, q }),
    scopeKey
  )
  const searchActive = focused || search.draft.length > 0
  const measured = width > 0
  const controlsCompact =
    measured && (width >= 460 ? searchActive || width < 720 : width < 360)

  useLayoutEffect(() => {
    const element = containerRef.current
    if (!element) return undefined
    setWidth(Math.round(element.getBoundingClientRect().width))
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.round(entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const patchFilter = (patch: Partial<TicketFilter>) => {
    onQueryChange({ ...query, ...patch })
  }
  const clearAll = () => {
    search.reset()
    onQueryChange({
      sort: query.sort,
      status: boardScope ? query.status : undefined
    })
  }
  const hasActiveFilters =
    (!boardScope && !!query.status?.length) ||
    activeFilterCount(query, filters) > 0 ||
    !!query.q

  return (
    <TicketToolbarContext
      value={{
        viewControls,
        query,
        onQueryChange,
        members,
        counts,
        filters,
        estimation,
        boardScope,
        search,
        searchActive,
        controlsCompact,
        setFocused,
        patchFilter,
        clearAll,
        hasActiveFilters
      }}
    >
      <div
        ref={containerRef}
        className="flex flex-wrap items-center gap-x-2 gap-y-2"
      >
        <SearchInput />
        {measured && (
          <div className="relative flex flex-wrap items-center gap-2">
            <Filters />
            <ViewOptions showSort={showSort} />
            <ClearAll />
          </div>
        )}
      </div>
    </TicketToolbarContext>
  )
}
