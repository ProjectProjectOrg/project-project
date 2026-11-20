import type { ComponentProps } from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { X } from "./icons"

/*
 * ToolbarButton: a list toolbar's trigger (filters, view options, grouping).
 * It shares the field look of the search input and select triggers beside
 * it: same height, fill, hairline and corners, with a muted leading icon.
 *
 * A trigger that can be cleared sits in a `group/toolbar` wrapper with a
 * ToolbarClearButton after it; hovering the clear button lights the field
 * too, so the two read as one control.
 *
 *   <div className="group/toolbar relative flex">
 *     <MenuTrigger render={<ToolbarButton active>…</ToolbarButton>} />
 *     <ToolbarClearButton label="Clear filters" onClick={clear} />
 *   </div>
 */
export function ToolbarButton({
  active,
  className,
  ...props
}: ComponentProps<typeof Button> & Readonly<{ active?: boolean }>) {
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
        "group-hover/toolbar:duration-0 group-hover/toolbar:not-disabled:shadow-field-hover-fill group-hover/toolbar:[&>svg:first-child]:text-foreground",
        className
      )}
    />
  )
}

export function ToolbarClearButton({
  label,
  onClick
}: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-xs"
      onClick={onClick}
      aria-label={label}
      className="absolute top-1/2 right-3 -translate-y-1/2 not-disabled:hover:bg-(--button-tertiary-hover) not-disabled:active:bg-(--button-tertiary-active)"
    >
      <X strokeWidth={1.75} />
    </Button>
  )
}
