import { Popover as PopoverPrimitive } from "@base-ui/react/popover"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import * as React from "react"

import { useActivityHiddenPortalRef } from "../hooks/useActivityHiddenPortalRef"
import {
  PopupAnchorProvider,
  usePopupAnchor,
  useTriggerAnchorRef
} from "../lib/popupAnchor"
import { transitions } from "../lib/springs"
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
                  "isolate origin-[var(--transform-origin)]",
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

// Unstyled by default, so it takes the header it sits in; `subtitle` is a
// popover's own heading.
function PopoverTitle({
  size = "inherit",
  className,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Title> &
  Readonly<{ size?: "inherit" | "subtitle" }>) {
  return (
    <PopoverPrimitive.Title
      data-slot="popover-title"
      className={cn(
        size === "subtitle" && "text-subtitle font-semibold",
        className
      )}
      {...props}
    />
  )
}

function PopoverClose(
  props: React.ComponentProps<typeof PopoverPrimitive.Close>
) {
  return <PopoverPrimitive.Close data-slot="popover-close" {...props} />
}

const fadeOnly = { height: { duration: 0 }, opacity: transitions.fade }

// A bar under a sectioned popover (p-0) that folds in while `show` holds,
// growing the popover by its height, and folds out again.
function PopoverFooter({
  show,
  className,
  children
}: Readonly<{ show: boolean; className?: string; children: React.ReactNode }>) {
  const reduce = useReducedMotion() ?? false
  const footerRef = React.useRef<HTMLDivElement>(null)
  // A press that hides the footer (Reset) would drop focus to the page;
  // hand it to the panel instead, so Tab and Escape keep working.
  React.useLayoutEffect(() => {
    const footer = footerRef.current
    if (show || !footer?.contains(document.activeElement)) return
    footer.closest<HTMLElement>("[data-slot=popover-content]")?.focus()
  }, [show])
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          ref={footerRef}
          data-slot="popover-footer"
          initial={{ height: 0, opacity: 0 }}
          animate={{
            height: "auto",
            opacity: 1,
            transition: reduce ? fadeOnly : transitions.layout
          }}
          exit={{
            height: 0,
            opacity: 0,
            transition: reduce ? fadeOnly : transitions.presence
          }}
          className="shrink-0 overflow-clip"
        >
          <div
            className={cn(
              "flex items-center justify-end gap-2 border-t border-border/60 px-3 py-2",
              className
            )}
          >
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverTitle,
  PopoverClose,
  PopoverFooter
}
