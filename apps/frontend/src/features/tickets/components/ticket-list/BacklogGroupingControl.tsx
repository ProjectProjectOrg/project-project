import { CircleDot, Layers, ListTree, Timer } from "lucide-react"
import { useMemo } from "react"

import { useCommandScope } from "@/features/command-menu/hooks/useCommandScope"
import type { Command } from "@/features/command-menu/lib/commands"
import type { BacklogGrouping } from "@/features/tickets/lib/backlogGrouping"
import { m } from "@/paraglide/messages"

import { GroupingMenu, type GroupingOption } from "./GroupingMenu"
import { useTicketToolbar } from "./toolbar/context"

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
  const { controlsCompact } = useTicketToolbar()
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
  return (
    <GroupingMenu
      value={value}
      options={groupingOptions()}
      onChange={onChange}
      compact={controlsCompact}
    />
  )
}
