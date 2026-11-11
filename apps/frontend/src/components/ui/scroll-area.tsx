import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"
import { createContext, useContext, type ComponentProps } from "react"

import { useTouchPrimary } from "@/hooks/useTouchPrimary"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const ScrollAreaContext = createContext<boolean>(false)

const VIEWPORT_FOCUS =
  "outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"

type Orientation = "vertical" | "horizontal" | "both"

type ViewportProps = ComponentProps<"div"> &
  Readonly<Record<`data-${string}`, string | number>>

type ScrollAreaProps = ComponentProps<"div"> &
  Readonly<{
    viewportClassName?: string
    viewportProps?: ViewportProps
    orientation?: Orientation
  }>

function ScrollArea({
  className,
  children,
  viewportClassName,
  viewportProps,
  orientation = "vertical",
  ref,
  ...props
}: ScrollAreaProps) {
  const isTouch = useTouchPrimary()

  return (
    <ScrollAreaContext.Provider value={isTouch}>
      {isTouch ? (
        <div
          ref={ref}
          role="group"
          data-slot="scroll-area"
          aria-roledescription={m.common_scroll_area_label()}
          className={cn("relative overflow-hidden", className)}
          {...props}
        >
          <div
            {...viewportProps}
            data-slot="scroll-area-viewport"
            className={cn(
              "size-full rounded-[inherit]",
              VIEWPORT_FOCUS,
              orientation === "vertical" && "overflow-y-auto",
              orientation === "horizontal" && "overflow-x-auto",
              orientation === "both" && "overflow-auto",
              viewportClassName
            )}
            // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a scroll viewport takes focus so the keyboard can scroll it
            tabIndex={0}
          >
            {children}
          </div>
        </div>
      ) : (
        <ScrollAreaPrimitive.Root
          ref={ref}
          data-slot="scroll-area"
          className={cn("relative overflow-hidden", className)}
          {...props}
        >
          <ScrollAreaPrimitive.Viewport
            {...viewportProps}
            data-slot="scroll-area-viewport"
            className={cn(
              "size-full rounded-[inherit]",
              VIEWPORT_FOCUS,
              viewportClassName
            )}
          >
            <ScrollAreaPrimitive.Content>
              {children}
            </ScrollAreaPrimitive.Content>
          </ScrollAreaPrimitive.Viewport>
          {orientation !== "horizontal" && <ScrollBar orientation="vertical" />}
          {orientation !== "vertical" && <ScrollBar orientation="horizontal" />}
          {orientation === "both" && <ScrollAreaPrimitive.Corner />}
        </ScrollAreaPrimitive.Root>
      )}
    </ScrollAreaContext.Provider>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ref,
  ...props
}: ComponentProps<typeof ScrollAreaPrimitive.Scrollbar>) {
  const isTouch = useContext(ScrollAreaContext)

  if (isTouch) return null

  return (
    <ScrollAreaPrimitive.Scrollbar
      ref={ref}
      orientation={orientation}
      data-slot="scroll-area-scrollbar"
      className={cn(
        "group/scrollbar absolute z-20 flex touch-none select-none",
        "opacity-0 transition-opacity delay-160 duration-120 ease-out",
        "data-[hovering]:duration-160 data-[scrolling]:duration-160",
        "data-[hovering]:opacity-100 data-[scrolling]:opacity-100",
        "data-[hovering]:delay-0 data-[scrolling]:delay-0",
        orientation === "vertical" && "top-0 right-0 h-full w-2.5",
        orientation === "horizontal" && "bottom-0 left-0 h-2.5 w-full flex-col",
        className
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className={cn(
          "relative bg-foreground/15 transition-[background-color,width,height] duration-160 ease-in-out",
          "group-hover/scrollbar:bg-foreground/25 active:!bg-foreground/35",
          "rounded-[20px]",
          orientation === "vertical" &&
            "mx-auto my-1 h-[var(--scroll-area-thumb-height)] w-1 -translate-x-0.5 group-hover/scrollbar:w-1.5",
          orientation === "horizontal" &&
            "mx-1 my-auto h-1 w-[var(--scroll-area-thumb-width)] -translate-y-0.5 group-hover/scrollbar:h-1.5"
        )}
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
export type { ScrollAreaProps }
