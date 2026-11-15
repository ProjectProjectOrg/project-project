import { Tooltip as TooltipPrimitive } from "@base-ui/react/tooltip"
import * as React from "react"

import { cn } from "../lib/utils"

// Ink: the foreground colour as the fill and the page colour as the text, so
// a tooltip reads as a label over any surface and never as a menu. Squircle
// corners at about half the height, no border, no shadow.
const inkClass =
  "z-50 rounded-[9px] bg-foreground px-2 py-[5px] text-caption text-primary-foreground outline-none [corner-shape:var(--button-corner)]"

// Opens with a fade and a scale from 96% over 100ms; when the provider
// shows it at once (moving along a toolbar), Base UI sets data-instant.
const motionClass =
  "origin-[var(--transform-origin)] transition-[opacity,scale] duration-100 ease-standard data-[ending-style]:scale-96 data-[ending-style]:opacity-0 data-[instant]:transition-none data-[starting-style]:scale-96 data-[starting-style]:opacity-0 motion-reduce:transition-opacity"

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

type Placement = Pick<
  React.ComponentProps<typeof TooltipPrimitive.Positioner>,
  "align" | "side" | "sideOffset"
>

type TooltipContentProps = React.ComponentProps<typeof TooltipPrimitive.Popup> &
  Placement

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
          className={cn(inkClass, motionClass, className)}
          {...props}
        />
      </TooltipPrimitive.Positioner>
    </TooltipPrimitive.Portal>
  )
}

// One tooltip shared by a row of triggers, like a toolbar. Once it is open,
// moving to the next trigger doesn't close and reopen it: the popup glides
// to the new trigger, eases to the new width, and the label blurs from the
// old text to the new one (the same swap as BlurSwap).
const TooltipGroupContext =
  React.createContext<TooltipPrimitive.Handle<React.ReactNode> | null>(null)

type TooltipGroupProps = Placement &
  Readonly<{
    children: React.ReactNode
    // ms before the first tooltip opens; the rest switch at once.
    delay?: number
    className?: string
  }>

// The glide: the positioner moves and the popup resizes over 200ms on the
// house easing (ease-standard), and the label swap below runs on the same
// clock. Opening and closing stay at the standalone tooltip's 100ms. All of
// it snaps when Base UI marks the change instant.
const glideTransition =
  "transition-[top,left,right,bottom,transform] duration-200 ease-standard data-[instant]:transition-none motion-reduce:transition-none"

const groupPopupClass =
  "h-[var(--popup-height,auto)] w-[var(--popup-width,auto)] whitespace-nowrap [transition:width_200ms_cubic-bezier(0.22,1,0.36,1),height_200ms_cubic-bezier(0.22,1,0.36,1),opacity_100ms_cubic-bezier(0.22,1,0.36,1),scale_100ms_cubic-bezier(0.22,1,0.36,1)] data-[ending-style]:scale-96 data-[ending-style]:opacity-0 data-[instant]:transition-none data-[starting-style]:scale-96 data-[starting-style]:opacity-0 motion-reduce:transition-opacity"

// The label swap: the viewport carries the padding and clips, and the old
// label keeps its own width (--popup-width) while it leaves, so nothing
// reflows or spills past the edge. The blur itself is a keyframe animation
// in theme.css (.pp-tooltip-viewport), not a transition: Base UI turns
// transitions off on the new label while it measures the new size, and an
// animation restarts cleanly once that's done.
const viewportClass =
  "pp-tooltip-viewport relative h-full w-full overflow-clip px-2 py-[5px] [&>[data-previous]]:w-[calc(var(--popup-width)-1rem)]"

function TooltipGroup({
  children,
  delay = 400,
  align = "center",
  side = "top",
  sideOffset = 6,
  className
}: TooltipGroupProps) {
  const [handle] = React.useState(() =>
    TooltipPrimitive.createHandle<React.ReactNode>()
  )
  return (
    <TooltipPrimitive.Provider delay={delay}>
      <TooltipGroupContext value={handle}>{children}</TooltipGroupContext>
      <TooltipPrimitive.Root handle={handle}>
        {({ payload }) => (
          <TooltipPrimitive.Portal>
            <TooltipPrimitive.Positioner
              align={align}
              side={side}
              sideOffset={sideOffset}
              className={cn(
                "z-50 h-(--positioner-height) w-(--positioner-width) max-w-(--available-width)",
                glideTransition
              )}
            >
              <TooltipPrimitive.Popup
                data-slot="tooltip-content"
                className={cn(
                  inkClass,
                  "origin-[var(--transform-origin)] overflow-clip p-0",
                  groupPopupClass,
                  className
                )}
              >
                <TooltipPrimitive.Viewport className={viewportClass}>
                  {payload}
                </TooltipPrimitive.Viewport>
              </TooltipPrimitive.Popup>
            </TooltipPrimitive.Positioner>
          </TooltipPrimitive.Portal>
        )}
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}

type TooltipGroupTriggerProps = Omit<
  React.ComponentProps<typeof TooltipPrimitive.Trigger>,
  "handle" | "payload" | "content"
> &
  Readonly<{
    // What the shared tooltip shows while this trigger is active.
    tooltip: React.ReactNode
  }>

function TooltipGroupTrigger({ tooltip, ...props }: TooltipGroupTriggerProps) {
  const handle = React.useContext(TooltipGroupContext)
  if (handle === null) {
    throw new Error("TooltipGroupTrigger must be inside a TooltipGroup")
  }
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      handle={handle}
      payload={tooltip}
      {...props}
    />
  )
}

export {
  Tooltip,
  TooltipProvider,
  TooltipTrigger,
  TooltipContent,
  TooltipGroup,
  TooltipGroupTrigger
}
