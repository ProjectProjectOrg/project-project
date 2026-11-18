import { Switch as SwitchPrimitive } from "@base-ui/react/switch"
import { useRef } from "react"
import type * as React from "react"

import { cn } from "../lib/utils"

// How far the pressed thumb travels: the off thumb (14px wide while pressed,
// 3px inset) and the on thumb (20px wide while pressed) both have 12px of
// room inside the 32px track.
const TRAVEL = 12
// Pointer movement below this is a click, not a drag.
const DRAG_SLOP = 3

type Drag = {
  startX: number
  // Rendered size over layout size, so a zoomed or scaled switch drags 1:1.
  scale: number
  from: number
  wasChecked: boolean
  moved: boolean
  position: number
}

const clamp = (value: number) => Math.min(TRAVEL, Math.max(0, value))

// Looks like Checkbox: off is a ring with a small muted thumb, on fills with
// ink and the thumb grows to full size. Pressing stretches the thumb toward
// where it will go; the thumb can also be dragged and snaps to the nearer
// side. Styles live in theme.css (.pp-switch).
function Switch({
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onClick,
  onKeyDown,
  onKeyUp,
  onBlur,
  loading = false,
  readOnly,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> &
  Readonly<{
    // Waiting for the change to save: the thumb sits on its new side and
    // shimmers with the logo loader's sweep; input is ignored meanwhile.
    loading?: boolean
  }>) {
  const drag = useRef<Drag | null>(null)
  const swallowClick = useRef(false)

  const end = (element: Element) => {
    element.removeAttribute("data-dragging")
    if (element instanceof HTMLElement)
      element.style.removeProperty("--switch-drag")
    drag.current = null
  }

  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      className={cn("pp-switch focus-ring", className)}
      readOnly={readOnly === true || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      onPointerDown={(event) => {
        onPointerDown?.(event)
        const element = event.currentTarget
        if (
          event.button !== 0 ||
          element.hasAttribute("data-disabled") ||
          element.hasAttribute("data-readonly")
        ) {
          return
        }
        const wasChecked = element.hasAttribute("data-checked")
        element.setPointerCapture(event.pointerId)
        const scale =
          element.getBoundingClientRect().width / (element.offsetWidth || 1)
        drag.current = {
          startX: event.clientX,
          scale: scale > 0 ? scale : 1,
          from: wasChecked ? TRAVEL : 0,
          wasChecked,
          moved: false,
          position: wasChecked ? TRAVEL : 0
        }
      }}
      onPointerMove={(event) => {
        onPointerMove?.(event)
        const current = drag.current
        if (current === null) return
        const delta = (event.clientX - current.startX) / current.scale
        if (!current.moved && Math.abs(delta) < DRAG_SLOP) return
        current.moved = true
        current.position = clamp(current.from + delta)
        const element = event.currentTarget
        element.setAttribute("data-dragging", "")
        element.style.setProperty("--switch-drag", `${current.position}px`)
      }}
      onPointerUp={(event) => {
        onPointerUp?.(event)
        const current = drag.current
        if (current === null) return
        // A drag that ends on the side it started from is not a toggle, so
        // the click that follows the release is swallowed.
        if (current.moved) {
          const landsChecked = current.position > TRAVEL / 2
          swallowClick.current = landsChecked === current.wasChecked
        }
        end(event.currentTarget)
      }}
      onPointerCancel={(event) => {
        onPointerCancel?.(event)
        end(event.currentTarget)
      }}
      // Holding Space or Enter shows the same press as a pointer: the thumb
      // stretches toward where it will go (styled through data-pressed).
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if ((event.key === " " || event.key === "Enter") && !event.repeat)
          event.currentTarget.setAttribute("data-pressed", "")
      }}
      onKeyUp={(event) => {
        onKeyUp?.(event)
        event.currentTarget.removeAttribute("data-pressed")
      }}
      onBlur={(event) => {
        onBlur?.(event)
        event.currentTarget.removeAttribute("data-pressed")
      }}
      onClick={(event) => {
        onClick?.(event)
        if (!swallowClick.current) return
        swallowClick.current = false
        event.preventBaseUIHandler()
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb
        className={cn("pp-switch-thumb", loading && "pp-loader")}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
