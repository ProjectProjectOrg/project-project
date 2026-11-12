import { useAtomValue } from "@effect/atom-react"
import type { TicketListQuery } from "@pp/shared"
import * as Result from "effect/reactivity/AsyncResult"
import { FilterX, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Empty, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { useProjectRoute } from "@/features/projects/hooks/useProject"
import {
  countsRequest,
  ticketCounts
} from "@/features/tickets/atoms/ticketCounts"
import { withoutEpicsByDefault } from "@/features/tickets/lib/ticketRows"
import { m } from "@/paraglide/messages"

import { useResetFilters } from "./useResetFilters"

export function FilteredEmpty({
  query
}: Readonly<{ query: TicketListQuery }>) {
  const { orgSlug, slug } = useProjectRoute()
  const resetFilters = useResetFilters()
  const unfiltered = useAtomValue(
    ticketCounts(
      countsRequest(
        orgSlug,
        slug,
        withoutEpicsByDefault({ scopeGroupId: query.scopeGroupId })
      )
    )
  )
  const hidden = Result.isSuccess(unfiltered) ? unfiltered.value.total : null
  return (
    <Empty>
      <EmptyMedia variant="icon">
        <FilterX strokeWidth={1.75} />
      </EmptyMedia>
      <EmptyTitle>{m.tickets_no_filter_matches_title()}</EmptyTitle>
      <div className="mt-3 flex h-11 w-[22.5rem] max-w-full items-center justify-between gap-3 rounded-[14px] bg-surface-2 pr-1.5 pl-4 text-body shadow-surface-2">
        <span className="min-w-0 truncate text-left">
          {hidden !== null && (
            <>
              <span className="text-foreground tabular-nums">
                {m.tickets_no_filter_matches_hidden({ count: hidden })}
              </span>{" "}
              <span className="text-muted-foreground">
                {m.tickets_no_filter_matches_hidden_suffix()}
              </span>
            </>
          )}
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          trailingIcon={X}
          className="text-foreground"
          onClick={resetFilters}
        >
          {m.tickets_filters_clear_all()}
        </Button>
      </div>
    </Empty>
  )
}
