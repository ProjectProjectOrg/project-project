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
import { atPointerMotionClass, menuPopupClass } from "./menu-styles"
import { tookOverFromHover } from "./tooltip"

// Opened in place of a showing tooltip or hover card, it appears at once.
const InstantContext = React.createContext(false)

function ContextMenu({
  actionsRef: givenActions,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  const root = useMenuRoot(givenActions, onOpenChange)
  const [instant, setInstant] = React.useState(false)
  return (
    <MenuControlProvider value={root.control}>
      <MenuPickedContext value={root.picked}>
        <InstantContext value={instant}>
          <ContextMenuPrimitive.Root
            {...props}
            actionsRef={root.ref}
            onOpenChange={(open, details) => {
              setInstant(open && tookOverFromHover())
              root.onOpenChange(open, details)
            }}
          />
        </InstantContext>
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
  const instant = React.use(InstantContext)
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
          className={cn(menuPopupClass, atPointerMotionClass, className)}
          style={instant ? { animation: "none" } : undefined}
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
