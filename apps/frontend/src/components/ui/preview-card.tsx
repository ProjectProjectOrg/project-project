import { PreviewCard as PreviewCardPrimitive } from "@base-ui/react/preview-card"
import * as React from "react"

import { useActivityHiddenPortalRef } from "@/hooks/useActivityHiddenPortalRef"
import { cn } from "@/lib/utils"

type PreviewCardContentProps = React.ComponentProps<
  typeof PreviewCardPrimitive.Popup
> &
  Pick<
    React.ComponentProps<typeof PreviewCardPrimitive.Positioner>,
    "align" | "side" | "sideOffset"
  >

function PreviewCardContent({
  className,
  align = "start",
  side,
  sideOffset = 6,
  ...props
}: PreviewCardContentProps) {
  const portalRef = useActivityHiddenPortalRef()
  return (
    <PreviewCardPrimitive.Portal ref={portalRef}>
      <PreviewCardPrimitive.Positioner
        align={align}
        side={side}
        sideOffset={sideOffset}
        className="z-50"
      >
        <PreviewCardPrimitive.Popup
          data-slot="preview-card-content"
          className={cn(
            "rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-md outline-none",
            "origin-[var(--transform-origin)] transition-[opacity,scale] duration-100 ease-out data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[instant]:transition-none data-[starting-style]:scale-95 data-[starting-style]:opacity-0 motion-reduce:transition-none",
            className
          )}
          {...props}
        />
      </PreviewCardPrimitive.Positioner>
    </PreviewCardPrimitive.Portal>
  )
}

export { PreviewCardContent }
