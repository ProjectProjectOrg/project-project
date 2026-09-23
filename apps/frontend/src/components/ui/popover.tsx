import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import * as React from "react"

import { useActivityHiddenPortalRef } from "@/hooks/useActivityHiddenPortalRef"
import { cn } from "@/lib/utils"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root {...props} />
}

function PopoverPortal({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Portal>) {
  const portalRef = useActivityHiddenPortalRef()
  return <PopoverPrimitive.Portal ref={portalRef} {...props} />
}

function PopoverTrigger(
  props: React.ComponentProps<typeof PopoverPrimitive.Trigger>
) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />
}

type PopoverContentProps = React.ComponentProps<typeof PopoverPrimitive.Popup> &
  Pick<
    React.ComponentProps<typeof PopoverPrimitive.Positioner>,
    "align" | "alignOffset" | "side" | "sideOffset" | "anchor"
  > & {
    keepMounted?: boolean
  }

function PopoverContent({
  className,
  align = "end",
  alignOffset,
  side,
  sideOffset = 6,
  anchor,
  keepMounted,
  ...props
}: PopoverContentProps) {
  return (
    <PopoverPortal keepMounted={keepMounted}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={anchor}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            "z-50 rounded-lg border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none",
            "data-[closed]:animate-out data-[closed]:fade-out-0 data-[closed]:zoom-out-95 data-[open]:animate-in data-[open]:fade-in-0 data-[open]:zoom-in-95",
            className
          )}
          {...props}
        />
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  )
}

export { Popover, PopoverTrigger, PopoverContent }
