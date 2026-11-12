import { useAtomSet } from "@effect/atom-react"
import type { TicketFilter } from "@pp/shared"
import { useEffect } from "react"

import { commandMenuState } from "@/features/command-menu/atoms/commandMenu"
import { openCommandMenu } from "@/features/command-menu/lib/commandMenu"

import { useCreatorActive } from "../TicketCreatorShell"
import { TicketToolbarContext, type TicketToolbarProps } from "./context"
import { Filters } from "./Filters"
import { ClearAll } from "./parts"
import { ViewOptions } from "./ViewOptions"

export function TicketToolbar({
  leading,
  query,
  onQueryChange,
  onQueryPrefetch,
  members,
  counts,
  filters,
  estimation,
  showSort = false,
  viewControls,
  boardScope
}: TicketToolbarProps) {
  const compact = useCreatorActive()
  useSlashOpensCommandMenu()

  const patchFilter = (patch: Partial<TicketFilter>) => {
    onQueryChange({ ...query, ...patch })
  }
  const prefetchFilter = (patch: Partial<TicketFilter>) =>
    onQueryPrefetch({ ...query, ...patch, cursor: undefined })
  const clearAll = () =>
    onQueryChange({ sort: query.sort, scopeGroupId: query.scopeGroupId })
  const hasActiveFilters = (query.rules?.length ?? 0) > 0 || !!query.q

  return (
    <TicketToolbarContext
      value={{
        viewControls,
        query,
        onQueryChange,
        onQueryPrefetch,
        prefetchFilter,
        members,
        counts,
        filters,
        estimation,
        boardScope,
        compact,
        patchFilter,
        clearAll,
        hasActiveFilters
      }}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {leading && (
          <div className="min-w-0 flex-1 basis-[280px]">{leading}</div>
        )}
        <div className="relative ml-auto flex flex-wrap items-center justify-end gap-2">
          <Filters />
          <ViewOptions showSort={showSort} />
          <ClearAll />
        </div>
      </div>
    </TicketToolbarContext>
  )
}

function useSlashOpensCommandMenu() {
  const setCommandMenu = useAtomSet(commandMenuState)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "/" || e.defaultPrevented) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target
      if (
        t instanceof HTMLInputElement ||
        t instanceof HTMLTextAreaElement ||
        (t instanceof HTMLElement && t.isContentEditable)
      ) {
        return
      }
      e.preventDefault()
      setCommandMenu(openCommandMenu(null, "ticketSearch"))
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [setCommandMenu])
}
