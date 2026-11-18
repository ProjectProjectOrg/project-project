import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import * as React from "react"

import { useActivityHiddenPortalRef } from "../hooks/useActivityHiddenPortalRef"
import {
  PopupAnchorProvider,
  usePopupAnchor,
  useTriggerAnchorRef
} from "../lib/popupAnchor"
import { cn } from "../lib/utils"
import {
  PopupLayerContext,
  popupMotionClass,
  popupSurfaceClass,
  useRaisedPopupClass
} from "./menu-styles"
import { PopupHotkeyScope } from "./popup-hotkey-scope"
import { hoverCardSurfaceClass } from "./tooltip"

function Popover(props: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return (
    <PopupAnchorProvider>
      <PopoverPrimitive.Root {...props} />
    </PopupAnchorProvider>
  )
}

function PopoverPortal({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Portal>) {
  const portalRef = useActivityHiddenPortalRef()
  return <PopoverPrimitive.Portal ref={portalRef} {...props} />
}

function PopoverTrigger({
  ref,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  const anchorRef = useTriggerAnchorRef(ref)
  return (
    <PopoverPrimitive.Trigger
      data-slot="popover-trigger"
      ref={anchorRef}
      {...props}
    />
  )
}

type PopoverContentProps = Omit<
  React.ComponentProps<typeof PopoverPrimitive.Popup>,
  "render"
> &
  Pick<
    React.ComponentProps<typeof PopoverPrimitive.Positioner>,
    | "align"
    | "alignOffset"
    | "side"
    | "sideOffset"
    | "anchor"
    | "collisionAvoidance"
    | "collisionBoundary"
    | "collisionPadding"
  > & {
    // "hover" for a popover that opens on hover and only shows (a ticket
    // peek, an image): the hover card's skin, so it reads like the other
    // hovers rather than a menu. Click-opened popovers keep "popup".
    surface?: "popup" | "hover"
    keepMounted?: boolean
  }

function PopoverContent({
  className,
  align = "end",
  alignOffset,
  side,
  sideOffset = 4,
  anchor,
  collisionAvoidance,
  collisionBoundary,
  collisionPadding,
  keepMounted,
  surface = "popup",
  children,
  ...props
}: PopoverContentProps) {
  const popupAnchor = usePopupAnchor(anchor)
  const raisedClass = useRaisedPopupClass()
  return (
    <PopoverPortal keepMounted={keepMounted}>
      <PopoverPrimitive.Positioner
        align={align}
        alignOffset={alignOffset}
        side={side}
        sideOffset={sideOffset}
        anchor={popupAnchor}
        collisionAvoidance={collisionAvoidance}
        collisionBoundary={collisionBoundary}
        collisionPadding={collisionPadding}
      >
        <PopoverPrimitive.Popup
          data-slot="popover-content"
          className={cn(
            surface === "hover"
              ? cn(
                  "z-50 origin-[var(--transform-origin)]",
                  hoverCardSurfaceClass
                )
              : popupSurfaceClass,
            raisedClass,
            popupMotionClass,
            "p-3",
            className
          )}
          {...props}
          render={(popupProps, state) => (
            <div {...popupProps}>
              <PopupHotkeyScope open={state.open}>
                {popupProps.children}
              </PopupHotkeyScope>
            </div>
          )}
        >
          <PopupLayerContext value={true}>{children}</PopupLayerContext>
        </PopoverPrimitive.Popup>
      </PopoverPrimitive.Positioner>
    </PopoverPortal>
  )
}

function PopoverTitle(
  props: React.ComponentProps<typeof PopoverPrimitive.Title>
) {
  return <PopoverPrimitive.Title data-slot="popover-title" {...props} />
}

function PopoverClose(
  props: React.ComponentProps<typeof PopoverPrimitive.Close>
) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

export { Popover, PopoverTrigger, PopoverContent, PopoverTitle, PopoverClose }
