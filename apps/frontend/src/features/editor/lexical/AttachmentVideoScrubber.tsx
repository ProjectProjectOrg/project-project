import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react"

import { cn } from "@/lib/utils"

const BAR =
  "absolute top-1/2 left-0 h-[3px] -translate-y-1/2 rounded-full transition-all duration-150 group-hover/reveal:h-[5px] group-data-[dragging=true]/reveal:h-[5px]"

const fractionAt = (event: PointerEvent<HTMLSpanElement>): number => {
  const rect = event.currentTarget.getBoundingClientRect()
  if (rect.width === 0) return 0
  return Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
}

export function AttachmentVideoScrubber({
  value,
  buffered,
  label,
  valueText,
  hoverText,
  onChange,
  onStep,
  className
}: Readonly<{
  value: number
  buffered?: number
  label: string
  valueText: string
  hoverText?: (fraction: number) => string
  onChange: (fraction: number) => void
  onStep: (direction: -1 | 1) => void
  className?: string
}>) {
  const ref = useRef<HTMLSpanElement>(null)
  const [dragging, setDragging] = useState(false)
  const [hover, setHover] = useState<number | null>(null)

  const onPointerDown = (event: PointerEvent<HTMLSpanElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    event.currentTarget.focus({ preventScroll: true })
    setDragging(true)
    onChange(fractionAt(event))
  }

  const onPointerMove = (event: PointerEvent<HTMLSpanElement>) => {
    const fraction = fractionAt(event)
    setHover(fraction)
    if (dragging) onChange(fraction)
  }

  const onPointerEnd = (event: PointerEvent<HTMLSpanElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId)
    setDragging(false)
  }

  const onKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    const direction =
      event.key === "ArrowRight" || event.key === "ArrowUp"
        ? 1
        : event.key === "ArrowLeft" || event.key === "ArrowDown"
          ? -1
          : null
    if (direction === null) return
    event.preventDefault()
    event.stopPropagation()
    onStep(direction)
  }

  const percent = `${Math.min(Math.max(value, 0), 1) * 100}%`

  return (
    <span
      ref={ref}
      role="slider"
      tabIndex={0}
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(value * 100)}
      aria-valuetext={valueText}
      data-dragging={dragging ? "true" : undefined}
      className={cn(
        "group/reveal relative block h-6 cursor-pointer touch-none outline-none",
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onPointerLeave={() => setHover(null)}
      onKeyDown={onKeyDown}
    >
      <span className={cn(BAR, "right-0 bg-foreground/15")} />
      {buffered === undefined ? null : (
        <span
          className={cn(BAR, "bg-foreground/20")}
          style={{ width: `${Math.min(Math.max(buffered, 0), 1) * 100}%` }}
        />
      )}
      <span className={cn(BAR, "bg-foreground")} style={{ width: percent }} />
      <span
        className="absolute top-1/2 -ml-[5.5px] size-[11px] -translate-y-1/2 scale-0 rounded-full bg-foreground transition-all duration-150 group-hover/reveal:scale-100 group-focus-visible/reveal:scale-100 group-data-[dragging=true]/reveal:scale-100"
        style={{ left: percent }}
      />
      {hoverText === undefined || hover === null ? null : (
        <span
          className="pointer-events-none absolute bottom-5 -translate-x-1/2 rounded-md bg-foreground px-1.5 py-0.5 text-micro text-background tabular-nums"
          style={{ left: `${Math.min(Math.max(hover, 0.04), 0.96) * 100}%` }}
        >
          {hoverText(hover)}
        </span>
      )}
    </span>
  )
}
