import { CommandMenuCheck, CommandMenuItem } from "@pp/ui/command-menu"
import * as Data from "effect/Data"
import { useEffect } from "react"

import { CommandFrame } from "@/features/command-menu/components/CommandFrame"
import type { CommandPageProps } from "@/features/command-menu/lib/commandPages"
import {
  FILTER_DIMENSION_META,
  type FilterOption
} from "@/features/tickets/hooks/useFilterOptions"
import {
  isValueDimension,
  type ValueFilterDimension
} from "@/features/tickets/lib/filterChoices"
import { m } from "@/paraglide/messages"

function FilterPrefetch({
  option,
  prefetch
}: Readonly<{
  option: FilterOption
  prefetch: (choice: FilterOption["choice"]) => void
}>) {
  useEffect(() => prefetch(option.choice), [prefetch, option.choice])
  return null
}

const warmFilter =
  (
    context: CommandPageProps["context"],
    options: ReadonlyArray<FilterOption>
  ) =>
  (value: string) => {
    const option = options.find((candidate) => candidate.key === value)
    return option === undefined || context.view === null ? null : (
      <FilterPrefetch option={option} prefetch={context.view.prefetch} />
    )
  }

type HubRow = Data.TaggedEnum<{
  dimension: {
    readonly value: string
    readonly dimension: ValueFilterDimension
    readonly summary: string
  }
  toggle: { readonly value: string; readonly option: FilterOption }
}>
const HubRow = Data.taggedEnum<HubRow>()

const hubRows = (options: ReadonlyArray<FilterOption>) =>
  [
    ...new Set(options.map((option) => option.choice.dimension))
  ].flatMap<HubRow>((dimension) => {
    const inDimension = options.filter(
      (option) => option.choice.dimension === dimension
    )
    if (!isValueDimension(dimension)) {
      return inDimension.map((option) =>
        HubRow.toggle({ value: option.key, option })
      )
    }
    return [
      HubRow.dimension({
        value: `dimension:${dimension}`,
        dimension,
        summary: inDimension
          .flatMap((option) => (option.chosen ? [option.label] : []))
          .join(", ")
      })
    ]
  })

export function ViewFilterPage({ context, onBack, env }: CommandPageProps) {
  const options = context.view?.options ?? []
  const rows = hubRows(options)
  const rowFor = (value: string) => rows.find((row) => row.value === value)
  return (
    <CommandFrame
      chip={null}
      placeholder={m.tickets_command_filter_placeholder()}
      onBack={onBack}
      warmPeek={warmFilter(context, options)}
      items={rows.map(
        HubRow.$match({
          toggle: ({ value, option }) => ({
            value,
            label: option.label,
            icon: option.icon
          }),
          dimension: ({ value, dimension }) => ({
            value,
            label: FILTER_DIMENSION_META[dimension].label(),
            icon: FILTER_DIMENSION_META[dimension].icon
          })
        })
      )}
      onSelect={(item) => {
        const row = rowFor(item.value)
        if (row === undefined) return
        HubRow.$match(row, {
          dimension: ({ dimension }) => env.open(`filter:${dimension}`),
          toggle: ({ option }) => context.view?.toggle(option.choice)
        })
      }}
      renderItem={(item) => {
        const row = rowFor(item.value)
        return (
          <CommandMenuItem value={item.value}>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {row !== undefined && HubRow.$is("dimension")(row) && (
              <span className="max-w-1/2 truncate text-muted-foreground">
                {row.summary}
              </span>
            )}
            <CommandMenuCheck
              checked={
                row !== undefined &&
                HubRow.$is("toggle")(row) &&
                row.option.chosen
              }
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )
      }}
    />
  )
}

export const viewFilterDimensionPage = (dimension: ValueFilterDimension) =>
  function ViewFilterDimensionPage({ context, onBack }: CommandPageProps) {
    const options = (context.view?.options ?? []).filter(
      (option) => option.choice.dimension === dimension
    )
    return (
      <CommandFrame
        chip={null}
        placeholder={m.tickets_command_filter_pick_placeholder({
          dimension: FILTER_DIMENSION_META[dimension].label()
        })}
        onBack={onBack}
        warmPeek={warmFilter(context, options)}
        items={options.map((option) => ({
          value: option.key,
          label: option.label,
          icon: option.icon
        }))}
        onSelect={(item) => {
          const option = options.find(
            (candidate) => candidate.key === item.value
          )
          if (option !== undefined) context.view?.toggle(option.choice)
        }}
        renderItem={(item) => (
          <CommandMenuItem value={item.value}>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <CommandMenuCheck
              checked={options.some(
                (option) => option.key === item.value && option.chosen
              )}
              label={m.chrome_command_menu_selected()}
            />
          </CommandMenuItem>
        )}
      />
    )
  }
