import { Button } from "@pp/ui/button"
import { ChevronDown } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import { Select, SelectTrigger, type SelectOption } from "@pp/ui/select"
import type { ComponentProps, ReactNode } from "react"

import { m } from "@/paraglide/messages"

// Toolbar triggers (filters, view options, grouping) share the field look of
// the search input and select triggers beside them: same height, fill,
// hairline and corners, with a muted leading icon and the select's chevron.
export function ToolbarButton({
  active,
  className,
  ...props
}: ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      type="button"
      variant="field"
      tone="strong"
      size="lg"
      aria-pressed={active}
      {...props}
      className={cn(
        "gap-2 [&>svg:first-child]:text-muted-foreground [&>svg:first-child]:transition-[color,stroke-width] [&>svg:first-child]:duration-80 hover:[&>svg:first-child]:text-foreground data-[popup-open]:[&>svg:first-child]:text-foreground",
        className
      )}
    />
  )
}

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
  const Items extends ReadonlyArray<SelectOption<string>>
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
        <Select
          items={items}
          value={value}
          onValueChange={onValueChange}
          contentProps={{ align: "end", className: "w-56" }}
        >
          <SelectTrigger
            aria-label={m.tickets_view_options_picker_aria_label({
              label,
              value: displayValue
            })}
            selectedLabel={displayValue}
            className="h-8 w-40 min-w-0"
          />
        </Select>
      </div>
    </div>
  )
}
