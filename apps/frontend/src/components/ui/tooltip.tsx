import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import type { AppHotkey } from "@tanstack/react-hotkeys"
import * as React from "react"

import { KbdShortcut } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"

function TooltipProvider(
  props: React.ComponentProps<typeof TooltipPrimitive.Provider>
) {
  return <TooltipPrimitive.Provider delay={400} {...props} />
}

function Tooltip(props: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  return <TooltipPrimitive.Root {...props} />
}

function TooltipTrigger(
  props: React.ComponentProps<typeof TooltipPrimitive.Trigger>
) {
  return <TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
}

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof TooltipPrimitive.Positioner>,
    "align" | "side" | "sideOffset"
  >

function TooltipContent({
  className,
  align = "center",
  side = "top",
  sideOffset = 6,
  ...props
}: TooltipContentProps) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
      >
        <TooltipPrimitive.Popup
          data-slot="tooltip-content"
          className={cn(
            "z-50 rounded-sm border border-border bg-popover px-2 py-1 text-popover-foreground shadow-md outline-none",
            "text-caption",
            "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
            className
          )}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

function ShortcutTooltip({
  hotkey,
  label,
  children
}: Readonly<{
  hotkey: AppHotkey
  label?: string
  children: React.ReactElement
}>) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent className="flex items-center gap-2">
        {label ?? hotkey.meta?.name}
        {hotkey.hotkey !== null && (
          <KbdShortcut keys={hotkey.hotkey} size="sm" aria-hidden />
        )}
      </TooltipContent>
    </Tooltip>
  )
}

export {
  ShortcutTooltip,
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent
}
