import { ContextMenu as ContextMenuPrimitive } from "@base-ui/react/context-menu"
import * as React from "react"

import { MenuCloseProvider, useMenuActionsRef } from "../lib/menuClose"
import { cn } from "../lib/utils"
import { DropdownMenuPortal } from "./dropdown-menu"
import { MenuHighlight } from "./menu-highlight"
import { menuPopupClass } from "./menu-styles"

function ContextMenu({
  actionsRef: givenActions,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const actions = useMenuActionsRef(givenActions)
  return (
    <MenuCloseProvider value={actions.close}>
      <ContextMenuPrimitive.Root {...props} actionsRef={actions.ref} />
    </MenuCloseProvider>
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
