import { ChevronDown } from "lucide-react"

import { CollapsingLabel } from "@/components/ui/collapsing-label"
import { Select, SelectTrigger } from "@/components/ui/select"
import type { IconComponent } from "@/lib/icon"
import { m } from "@/paraglide/messages"

import { ToolbarButton } from "./toolbar/shared"

export type GroupingOption<K extends string> = Readonly<{
  key: K
  label: string
  icon: IconComponent
}>

type GroupingMenuProps<K extends string> = Readonly<{
  value: K
  options: ReadonlyArray<GroupingOption<K>>
  onChange: (value: K) => void
  compact?: boolean
}>

export function GroupingMenu<K extends string>({
  value,
  options,
  onChange,
  compact = false
}: GroupingMenuProps<K>) {
  const current = options.find((option) => option.key === value)
  const label = m.tickets_grouping_label({ label: current?.label ?? value })
  return (
    <Select
      items={options.map((option) => ({
        value: option.key,
        textValue: option.label,
        label: option.label,
        icon: option.icon
      }))}
      value={value}
      onValueChange={onChange}
      contentProps={{ align: "end" }}
    >
      <SelectTrigger
        render={
          <ToolbarButton aria-label={label}>
            {current && <current.icon className="size-4" />}
            <CollapsingLabel show={!compact}>{label}</CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" />
          </ToolbarButton>
        }
      />
    </Select>
  )
}
