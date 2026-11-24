import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuTrigger,
  type DropdownMenuRadioOption
} from "@pp/ui/dropdown-menu"
import { ChevronDown } from "@pp/ui/icons"
import { TextSwap } from "@pp/ui/text-swap"
import { ToolbarButton } from "@pp/ui/toolbar-button"
import type { ReactNode } from "react"

import { m } from "@/paraglide/messages"

export function ToolbarChevron() {
  return (
    <ChevronDown
      aria-hidden
      className="size-4 shrink-0 text-muted-foreground transition-[rotate,color] duration-280 ease-spring group-hover:text-foreground group-data-[popup-open]:rotate-180 group-data-[popup-open]:text-foreground motion-reduce:transition-none"
      strokeWidth={2}
    />
  )
}

export function OptionPicker<
  const Items extends ReadonlyArray<DropdownMenuRadioOption<string>>
>({
  label,
  value,
  displayValue,
  onValueChange,
  items,
  action
}: Readonly<{
  action?: ReactNode
  label: string
  value: NoInfer<Items[number]["value"]>
  displayValue: string
  onValueChange: (value: NoInfer<Items[number]["value"]>) => void
  items: Items
}>) {
  return (
    <div className="flex min-h-8 items-center justify-between gap-3">
      <span className="text-body text-muted-foreground">{label}</span>
      <div className="ml-auto flex items-center gap-1">
        {action}
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <ToolbarButton
                aria-label={m.tickets_view_options_picker_aria_label({
                  label,
                  value: displayValue
                })}
                className="h-8 w-40 min-w-0"
              />
            }
          >
            <TextSwap className="flex-1 gap-2 text-left">
              {displayValue}
            </TextSwap>
            <ToolbarChevron />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuRadioGroup
              value={value}
              onValueChange={onValueChange}
              items={items.map((item) => ({ ...item, closeOnClick: true }))}
            />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
