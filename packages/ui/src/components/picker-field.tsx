import type { ComponentProps, ReactElement } from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { ChevronRight } from "./icons"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

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

export function PickerFieldOpen({
  label,
  render,
  onClick,
  className
}: Readonly<{
  label: string
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
