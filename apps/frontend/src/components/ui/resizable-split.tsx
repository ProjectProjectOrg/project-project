import * as Schema from "effect/Schema"
import {
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from "react"

import {
  createLocalStorageCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { cn } from "@/lib/utils"

const sizeCodec = createLocalStorageCodec(Schema.Finite)

const KEY_STEP = 16

const KEY_SIZES = new Map<
  string,
  (size: number, min: number, max: number) => number
>([
  ["ArrowLeft", (size) => size - KEY_STEP],
  ["ArrowRight", (size) => size + KEY_STEP],
  ["Home", (_size, min) => min],
  ["End", (_size, _min, max) => max]
])

type ResizableSplitProps = Readonly<{
  storageKey: string
  label: string
  defaultSize: number
  min: number
  max: number
  show: "start" | "end"
  start: ReactNode
  end: ReactNode
  className?: string
}>

export function ResizableSplit({
  storageKey,
  label,
  defaultSize,
  min,
  max,
  show,
  start,
  end,
  className
}: ResizableSplitProps) {
  const [stored, store] = useLocalStorageState(
    storageKey,
    sizeCodec,
    defaultSize
  )
  const [dragged, setDragged] = useState<number | null>(null)
  const drag = useRef<Readonly<{ x: number; size: number }> | null>(null)
  const clamp = (value: number) =>
    Math.round(Math.min(max, Math.max(min, value)))
  const size = clamp(dragged ?? stored)

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { x: event.clientX, size }
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (drag.current === null) return
    setDragged(clamp(drag.current.size + event.clientX - drag.current.x))
  }
  const onPointerUp = () => {
    if (drag.current === null) return
    drag.current = null
    if (dragged !== null) store(dragged)
    setDragged(null)
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = KEY_SIZES.get(event.key)?.(size, min, max)
    if (next === undefined) return
    event.preventDefault()
    store(clamp(next))
  }

  return (
    <div
      className={cn("flex h-full min-h-0 w-full", className)}
      style={{ "--split-start": `${size}px` }}
    >
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col max-md:flex-1 md:w-(--split-start) md:shrink-0",
          show === "end" && "max-md:hidden"
        )}
      >
        {start}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label={label}
        aria-valuenow={size}
        aria-valuemin={min}
        aria-valuemax={max}
        tabIndex={0}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onDoubleClick={() => store(defaultSize)}
        onKeyDown={onKeyDown}
        className="group/split relative z-10 -mx-1 w-2 shrink-0 cursor-col-resize touch-none outline-none max-md:hidden"
      >
        <span
          aria-hidden
          className={cn(
            "absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border transition-colors group-hover/split:bg-ring group-focus-visible/split:bg-ring",
            dragged !== null && "bg-ring"
          )}
        />
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col",
          show === "start" && "max-md:hidden"
        )}
      >
        {end}
      </div>
    </div>
  )
}
