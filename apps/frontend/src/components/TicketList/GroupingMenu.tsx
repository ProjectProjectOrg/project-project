import { ChevronDown, Layers } from "lucide-react"

import { CollapsingLabel } from "@/components/SegmentedTabs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu"
import { m } from "@/paraglide/messages"

import { ToolbarButton } from "./toolbar/shared"

export type GroupingOption<K extends string> = Readonly<{
  key: K
  label: string
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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton aria-label={label}>
            <Layers className="size-4" />
            <CollapsingLabel show={!compact}>{label}</CollapsingLabel>
            <ChevronDown className="size-3.5 opacity-60" />
          </ToolbarButton>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            const option = options.find((item) => item.key === next)
            if (option) onChange(option.key)
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem
              key={option.key}
              value={option.key}
              closeOnClick
            >
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
