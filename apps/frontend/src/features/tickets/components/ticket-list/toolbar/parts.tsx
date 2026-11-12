import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { CollapsingLabel } from "@/components/ui/collapsing-label"
import { m } from "@/paraglide/messages"

import { useTicketToolbar } from "./context"

export function ClearAll() {
  const { hasActiveFilters, clearAll, query, onQueryPrefetch } =
    useTicketToolbar()
  return (
    <CollapsingLabel show={hasActiveFilters}>
      <Button
        variant="quiet"
        size="square-9"
        onClick={clearAll}
        onPointerEnter={() =>
          onQueryPrefetch({
            sort: query.sort,
            scopeGroupId: query.scopeGroupId
          })
        }
        onFocus={() =>
          onQueryPrefetch({
            sort: query.sort,
            scopeGroupId: query.scopeGroupId
          })
        }
        disabled={!hasActiveFilters}
        title={m.tickets_filters_clear_all()}
        aria-label={m.tickets_filters_clear_all()}
      >
        <X className="size-4 shrink-0" strokeWidth={1.75} />
      </Button>
    </CollapsingLabel>
  )
}
