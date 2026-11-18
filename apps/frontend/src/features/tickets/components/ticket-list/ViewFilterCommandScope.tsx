import type { TicketListQuery } from "@pp/shared"
import { FilterX, SlidersHorizontal } from "@pp/ui/icons"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import { Command } from "@/features/command-menu/lib/commands"
import {
  FILTER_DIMENSION_META,
  useFilterOptions
} from "@/features/tickets/hooks/useFilterOptions"
import {
  isValueDimension,
  toggleChoice,
  type FilterChoice
} from "@/features/tickets/lib/filterChoices"
import { appHotkeys } from "@/lib/appHotkeys"
import { m } from "@/paraglide/messages"

import {
  activeFilterCount,
  clearedFilters,
  type FilterDimension
} from "./toolbar/model"

export function ViewFilterCommandScope({
  dimensions,
  query,
  onQueryChange,
  onQueryPrefetch
}: Readonly<{
  dimensions: ReadonlyArray<FilterDimension>
  query: TicketListQuery
  onQueryChange: (query: TicketListQuery) => void
  onQueryPrefetch: (query: TicketListQuery) => void
}>) {
  const options = useFilterOptions(dimensions, query)
  const scope = useMemo(() => {
    const toggle = (choice: FilterChoice) =>
      onQueryChange({ ...query, ...toggleChoice(query, choice) })
    const prefetch = (choice: FilterChoice) =>
      onQueryPrefetch({ ...query, ...toggleChoice(query, choice) })
    const commands: Array<Command> = [
      Command.page({
        id: "view.filter",
        hotkey: appHotkeys["tickets.filter"],
        group: "view",
        label: m.tickets_command_filter,
        icon: SlidersHorizontal,
        keywords: ["filters", "show only", "narrow"],
        page: "viewFilter"
      }),
      ...(activeFilterCount(query, dimensions) > 0
        ? [
            Command.run({
              id: "view.clear-filters",
              group: "view",
              label: m.tickets_filters_clear_all,
              icon: FilterX,
              keywords: ["reset", "remove filters"],
              run: (_context, env) => {
                onQueryChange({ ...query, ...clearedFilters(dimensions) })
                env.close()
              }
            })
          ]
        : []),
      ...options.map((option) =>
        Command.run({
          id: `view.filter.${option.key}`,
          group: "view",
          listed: "search",
          parent: option.chosen
            ? m.tickets_command_filter_remove_parent
            : m.tickets_command_filter_parent,
          label: () =>
            isValueDimension(option.choice.dimension)
              ? m.tickets_command_filter_value({
                  dimension:
                    FILTER_DIMENSION_META[option.choice.dimension].label(),
                  value: option.label
                })
              : option.label,
          icon: option.icon,
          run: (_context, env) => {
            toggle(option.choice)
            env.close()
          }
        })
      )
    ]
    return { view: { options, toggle, prefetch }, commands }
  }, [options, query, dimensions, onQueryChange, onQueryPrefetch])
  useCommandScope(scope)
  return null
}
