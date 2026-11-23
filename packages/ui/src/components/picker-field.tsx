import type { ComponentProps, ReactElement } from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { ChevronRight } from "./icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

/*
 * A field whose value you can change and also go to: a ticket's sprint or
 * epic. The value is a ghost button that opens a picker (the picker only
 * picks), and going there is a second button, a chevron that comes in
 * beside the value while the field is hovered or focused.
 *
 *   <PickerField>
 *     <DropdownMenu>
 *       <DropdownMenuTrigger render={<PickerFieldValue empty={!epic} />}>…</DropdownMenuTrigger>
 *       …
 *     </DropdownMenu>
 *     {epic && <PickerFieldOpen label={m.open_epic()} render={<Link … />} />}
 *   </PickerField>
 */

export function PickerField({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="picker-field"
      className={cn(
        "group/picker-field flex max-w-full min-w-0 items-center gap-1",
        className
      )}
      {...props}
    />
  )
}

// The value, and the picker's trigger. It stays lit while anything in the
// field is hovered, so the value and its chevron read as one thing.
export function PickerFieldValue({
  empty = false,
  tone,
  className,
  ...props
}: Readonly<{ empty?: boolean }> & ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="ghost"
      tone={tone ?? (empty ? "muted" : "strong")}
      className={cn(
        "min-w-0 group-hover/picker-field:bg-hover group-hover/picker-field:text-foreground group-hover/picker-field:duration-0",
        className
      )}
      {...props}
    />
  )
}

// Goes to the value. Hidden until the field is hovered or focused, at a
// fainter fill than the hover until the pointer is on it, and out of reach
// while the value's picker is open.
export function PickerFieldOpen({
  label,
  render,
  onClick,
  className
}: Readonly<{
  // Its tooltip and accessible name: "Open epic".
  label: string
  // A link to the value; otherwise onClick.
  render?: ReactElement
  onClick?: () => void
  className?: string
}>) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="square-7"
            aria-label={label}
            render={render}
            onClick={onClick}
            className={cn(
              "bg-[color-mix(in_oklab,var(--hover)_45%,transparent)] opacity-0 transition-[opacity,scale,background-color,color] duration-150 group-focus-within/picker-field:opacity-100 group-hover/picker-field:opacity-100 group-hover/picker-field:duration-0 group-has-[[data-popup-open]]/picker-field:pointer-events-none group-has-[[data-popup-open]]/picker-field:opacity-0",
              className
            )}
          />
        }
      >
        <ChevronRight className="size-3.5" strokeWidth={2} />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
