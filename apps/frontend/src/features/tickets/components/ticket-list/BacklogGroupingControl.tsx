import { CircleDot, Layers, ListTree, Timer } from "lucide-react"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { Command } from "@/features/command-menu/lib/commands"
import type { BacklogGrouping } from "@/features/tickets/lib/backlogGrouping"
import { m } from "@/paraglide/messages"

import type { GroupingOption } from "./GroupingMenu"
import { OptionPicker } from "./toolbar/shared"

const groupingOptions = (): ReadonlyArray<GroupingOption<BacklogGrouping>> => [
  { key: "status", label: m.tickets_grouping_status(), icon: CircleDot },
  { key: "sprint", label: m.tickets_grouping_sprint(), icon: Timer },
  { key: "epic", label: m.tickets_grouping_epic(), icon: Layers },
  { key: "parent", label: m.tickets_grouping_parent(), icon: ListTree }
]

export function BacklogGroupingControl({
  value,
  onChange
}: Readonly<{
  value: BacklogGrouping
  onChange: (value: BacklogGrouping) => void
}>) {
  const scope = useMemo(
    () => ({
      commands: groupingOptions()
        .filter((option) => option.key !== value)
        .map(
          (option): Command => ({
            id: `view.group-by.${option.key}`,
            group: "view",
            label: () => m.tickets_grouping_label({ label: option.label }),
            icon: option.icon,
            keywords: ["group", "grouping", "sections"],
            run: (_context, env) => {
              onChange(option.key)
              env.close()
            }
          })
        )
    }),
    [value, onChange]
  )
  useCommandScope(scope)
  const options = groupingOptions()
  return (
    <OptionPicker
      label={m.tickets_view_options_grouping()}
      value={value}
      onValueChange={onChange}
      displayValue={
        options.find((option) => option.key === value)?.label ?? value
      }
      items={options.map((option) => ({
        value: option.key,
        textValue: option.label,
        label: (
          <>
            <option.icon className="size-4" strokeWidth={1.75} />
            {option.label}
          </>
        )
      }))}
    />
  )
}
