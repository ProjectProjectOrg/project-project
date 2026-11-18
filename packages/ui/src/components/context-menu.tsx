import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import * as React from "react"

import {
  MenuControlProvider,
  MenuPickedContext,
  useMenuRoot
} from "../lib/menuClose"
import { cn } from "../lib/utils"
import { DropdownMenuPortal, pickNumberedItem } from "./dropdown-menu"
import { MenuHighlight } from "./menu-highlight"
import { menuPopupClass } from "./menu-styles"

function ContextMenu({
  actionsRef: givenActions,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const root = useMenuRoot(givenActions, onOpenChange)
  return (
    <MenuControlProvider value={root.control}>
      <MenuPickedContext value={root.picked}>
        <ContextMenuPrimitive.Root
          {...props}
          actionsRef={root.ref}
          onOpenChange={root.onOpenChange}
        />
      </MenuPickedContext>
    </MenuControlProvider>
  )
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
          onKeyDownCapture={pickNumberedItem}
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
