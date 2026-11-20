import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import { useLayoutEffect, useRef, useState, type Ref } from "react"

import { cn } from "../lib/utils"

/*
 * A slider whose field is the control: a 28px field (like an input), the
 * fill grows from its left edge to the thumb, which travels to the ends like
 * a native range input, and the value sits inside on
 * the right. The label sits above, the end labels under it.
 *
 *   <Slider
 *     label={m.project_icon_crop_zoom()}
 *     min={1}
 *     max={4}
 *     step={0.05}
 *     value={crop.zoom}
 *     onChange={(zoom) => form.setFieldValue("crop.zoom", zoom)}
 *     formatValue={(value) => `${value.toFixed(2)}×`}
 *     endLabels={[m.project_icon_crop_zoom_min(), m.project_icon_crop_zoom_max()]}
 *   />
 *
 * The thumb is the Switch's: a 6×16 squircle bar at rest, clear of the
 * field's edges, that springs into the Switch's 16px thumb on hover and
 * stretches 4px wide while it's dragged (the Switch's curve and timings).
 * The value makes way for it: when the thumb reaches the value, the value
 * springs to its other side, so it's never under the thumb and never hidden.
 *
 * Built on Base UI's Slider: the role, keyboard (arrows, Page Up/Down,
 * Home/End), pointer dragging and the label's association come from it;
 * `formatValue` also gives screen readers the value's text.
 */

type SliderProps = Readonly<{
  label: string
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  // How the value reads, inside the field and to screen readers.
  formatValue?: (value: number) => string
  // What the two ends mean ("Fit", "Close up"), under the field.
  endLabels?: readonly [string, string]
  disabled?: boolean
  className?: string
  ref?: Ref<HTMLDivElement>
}>

// The thumb's centre travels to the field's ends: at the minimum and
// maximum it sits on the field's visible edge, half over it. That edge is
// the curve of the rounded end, which lies about 2px in from the box over
// the thumb's height, so the travel stops 2px in. The field itself stays
// aligned with the label and end labels; only the thumb reaches past it.
const EDGE = 2
// The value's inset from the field's right edge.
const VALUE_INSET = 12
// The gap the value keeps from the thumb when it makes way.
const GAP = 8
// Half the thumb's width at rest, on hover and while dragged.
const HALF = { rest: 3, hover: 8, drag: 10 } as const

const plain = (value: number) => String(value)

// Where the value sits: at home on the right, or, once the thumb reaches
// it, just to the thumb's left (or right, if the left has no room).
function valueOffset(
  thumb: number,
  half: number,
  width: number,
  valueWidth: number
) {
  const home = width - VALUE_INSET - valueWidth
  if (thumb < home - half - GAP) return 0
  const behind = thumb - half - GAP - valueWidth - home
  if (home + behind >= VALUE_INSET) return behind
  return thumb + half + GAP - home
}

export function Slider({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  formatValue = plain,
  endLabels,
  disabled = false,
  className,
  ref
}: SliderProps) {
  const field = useRef<HTMLDivElement>(null)
  const readout = useRef<HTMLSpanElement>(null)
  const [size, setSize] = useState({ width: 0, value: 0 })
  const [hovered, setHovered] = useState(false)
  const [dragging, setDragging] = useState(false)
  const text = formatValue(value)

  // The field's width and the value's, for where the thumb and value sit.
  useLayoutEffect(() => {
    const element = field.current
    const shown = readout.current
    if (!element || !shown) return undefined
    const measure = () =>
      setSize((previous) => {
        const next = { width: element.clientWidth, value: shown.offsetWidth }
        return previous.width === next.width && previous.value === next.value
          ? previous
          : next
      })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observer.observe(shown)
    return () => observer.disconnect()
  }, [text])

  const span = max - min
  const progress = span <= 0 ? 0 : (value - min) / span
  const half = dragging ? HALF.drag : hovered ? HALF.hover : HALF.rest
  const thumb = EDGE + progress * Math.max(0, size.width - EDGE * 2)
  const offset =
    size.width === 0 ? 0 : valueOffset(thumb, half, size.width, size.value)

  return (
    <SliderPrimitive.Root
      ref={ref}
      value={value}
      onValueChange={(next) => onChange(next)}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      // Disabled text may fall under 4.5:1 (WCAG exempts inactive
      // controls); saying so lets checkers tell it from a real failure.
      aria-disabled={disabled || undefined}
      className={cn(
        "grid w-full gap-1.5 data-disabled:cursor-not-allowed data-disabled:opacity-50",
        className
      )}
    >
      <SliderPrimitive.Label className="text-body text-muted-foreground">
        {label}
      </SliderPrimitive.Label>
      <SliderPrimitive.Control
        ref={field}
        data-slot="slider-field"
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={() => setHovered(false)}
        onPointerDown={() => {
          if (disabled) return
          setDragging(true)
          const stop = () => {
            setDragging(false)
            window.removeEventListener("pointerup", stop)
            window.removeEventListener("pointercancel", stop)
          }
          window.addEventListener("pointerup", stop)
          window.addEventListener("pointercancel", stop)
        }}
        className="group/slider relative h-7 cursor-ew-resize touch-none rounded-[14px] bg-field shadow-[inset_0_0_0_1px_var(--slider-line)] select-none [corner-shape:var(--button-corner)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring data-disabled:cursor-not-allowed"
      >
        {/* The fill, from the field's edge to the thumb's centre, clipped
            to the field's corners (the field itself doesn't clip, so the
            thumb can sit over its edge). */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[14px] [corner-shape:var(--button-corner)]"
        >
          <span
            className="absolute inset-y-0 left-0 bg-(--slider-fill)"
            style={{ width: thumb }}
          />
        </span>
        {/* The thumb's travel: the field's full width. (Base UI makes the
            track position: relative, so a wrapper sizes it.) */}
        <div className="absolute inset-y-0" style={{ left: EDGE, right: EDGE }}>
          <SliderPrimitive.Track className="h-full">
            <SliderPrimitive.Thumb
              getAriaValueText={() => text}
              className="slider-thumb z-10 outline-none"
              data-hovered={hovered || undefined}
              data-pressing={dragging || undefined}
            />
          </SliderPrimitive.Track>
        </div>
        <span
          ref={readout}
          aria-hidden
          className="slider-value pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-foreground tabular-nums"
          style={{ translate: `${offset}px 0` }}
        >
          {text}
        </span>
      </SliderPrimitive.Control>
      {endLabels && (
        <div className="flex justify-between gap-4 text-caption text-muted-foreground">
          <span>{endLabels[0]}</span>
          <span className="text-right">{endLabels[1]}</span>
        </div>
      )}
    </SliderPrimitive.Root>
  )
}

export type { SliderProps }
