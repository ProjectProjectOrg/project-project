import { CollapsingLabel } from "@pp/ui/collapsing-label"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger
} from "@pp/ui/dropdown-menu"
import type { IconComponent } from "@pp/ui/lib/icon"
import { ToolbarButton } from "@pp/ui/toolbar-button"

import { m } from "@/paraglide/messages"

import { ToolbarChevron } from "./toolbar/shared"

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
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolbarButton aria-label={label}>
            {current && <current.icon className="size-4" />}
            <CollapsingLabel show={!compact}>{label}</CollapsingLabel>
            <ToolbarChevron />
          </ToolbarButton>
        }
      />
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={onChange}
          items={options.map((option) => ({
            value: option.key,
            textValue: option.label,
            closeOnClick: true,
            label: (
              <>
                <option.icon className="size-4" strokeWidth={1.75} />
                {option.label}
              </>
            )
          }))}
        />
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
