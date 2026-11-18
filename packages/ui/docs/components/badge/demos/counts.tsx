import { Badge } from "@pp/ui/badge"
import { Button } from "@pp/ui/button"
import { ChevronDown, CircleDashed, ListFilter } from "@pp/ui/icons"
import { useState } from "react"

// Counts next to a label: a ticket list section header, where the count is
// muted, and the toolbar's filter button, where the count of active filters
// reads in foreground.
export default function Counts() {
  const [filters, setFilters] = useState(2)
  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button
          variant="toolbar"
          size="sm"
          onClick={() => setFilters((count) => (count + 1) % 5)}
        >
          <ListFilter className="size-4" strokeWidth={1.75} />
          Filters
          {filters > 0 && (
            <>
              <Badge variant="count" active>
                {filters}
              </Badge>
              <span className="sr-only">active</span>
            </>
          )}
          <ChevronDown className="size-3.5 opacity-60" strokeWidth={1.75} />
        </Button>
      </div>
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <CircleDashed
          className="size-4 text-muted-foreground"
          strokeWidth={1.75}
        />
        <span className="text-body font-semibold">Backlog</span>
        <Badge variant="count">23</Badge>
        <span className="sr-only">tickets</span>
      </div>
    </div>
  )
}
