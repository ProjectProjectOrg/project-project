import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import * as React from "react"

import { DropdownMenuPortal } from "@/components/ui/dropdown-menu"
import { MenuHighlight } from "@/components/ui/menu-highlight"
import { menuPopupClass } from "@/components/ui/menu-styles"
import { cn } from "@/lib/utils"

function ContextMenu(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Root>
) {
  return <ContextMenuPrimitive.Root {...props} />
}

function ContextMenuTrigger(
  props: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>
) {
  return (
    <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
  )
}

function ContextMenuContent({
  className,
  onClick,
  onKeyDown,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Popup>) {
  return (
    <DropdownMenuPortal>
      <ContextMenuPrimitive.Positioner>
        <ContextMenuPrimitive.Popup
          data-slot="dropdown-menu-content"
          onClick={(event) => {
            onClick?.(event)
            event.stopPropagation()
          }}
          onKeyDown={(event) => {
            onKeyDown?.(event)
            event.stopPropagation()
          }}
          className={cn(menuPopupClass, className)}
          {...props}
        >
          <MenuHighlight />
          {children}
        </ContextMenuPrimitive.Popup>
      </ContextMenuPrimitive.Positioner>
    </DropdownMenuPortal>
  )
}

export { ContextMenu, ContextMenuTrigger, ContextMenuContent }
