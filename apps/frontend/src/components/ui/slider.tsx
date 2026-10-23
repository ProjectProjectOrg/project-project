import { Slider as SliderPrimitive } from "@base-ui/react/slider"
import {
  motion,
  useMotionValue,
  useTransform,
  animate,
  AnimatePresence,
  type MotionValue
} from "motion/react"
import {
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
  useMemo,
  type CSSProperties,
  type HTMLAttributes,
  type Ref
} from "react"

import { fontWeights } from "@/lib/font-weight"
import { useShape } from "@/lib/shape-context"
import { sliderSprings as spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

import {
  nearestStepIndex,
  pixelToValue,
  THUMB_SIZE,
  valueToPixel
} from "./slider-math"

type SliderSelection =
  | Readonly<{
      range?: false
      value: number
      onChange: (value: number) => void
    }>
  | Readonly<{
      range: true
      value: readonly [number, number]
      onChange: (value: readonly [number, number]) => void
    }>
type ValuePosition = "left" | "right" | "top" | "bottom" | "tooltip"

type SliderProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  "onChange" | "defaultValue"
> &
  SliderSelection &
  Readonly<{
    min?: number
    max?: number
    step?: number
    steps?: ReadonlyArray<number>
    showSteps?: boolean
    showValue?: boolean
    valuePosition?: ValuePosition
    formatValue?: (v: number) => string
    label?: string
    endLabels?: readonly [string, string]
    disabled?: boolean
    trackClassName?: string
    trackStyle?: CSSProperties
    fillClassName?: string
    fillStyle?: CSSProperties
    hideFill?: boolean
    thumbColor?: string
    thumbBorderColor?: string
    ref?: Ref<HTMLDivElement>
  }>

const THUMB_SIZE_REST = 16
const TRACK_BG_HEIGHT = 18
const DOT_SIZE = 4
const TRACK_INSET = (THUMB_SIZE - TRACK_BG_HEIGHT) / 2

type ValueDisplayProps = {
  values: ReadonlyArray<number>
  editingIndex: number | null
  onStartEdit: (index: number) => void
  onCommitEdit: (index: number, v: number) => void
  onCancelEdit: () => void
  min: number
  max: number
  step: number
  stepValues: number[] | null
  formatValue: (v: number) => string
  label?: string
  isRange: boolean
  isInteracting: boolean
}

function ValueDisplay({
  values,
  editingIndex,
  onStartEdit,
  onCommitEdit,
  onCancelEdit,
  min,
  max,
  step,
  stepValues,
  formatValue,
  label,
  isRange,
  isInteracting
}: ValueDisplayProps) {
  const shape = useShape()
  const [inputValue, setInputValue] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (editingIndex !== null) {
      setInputValue(String(values[editingIndex]))
      requestAnimationFrame(() => inputRef.current?.select())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editingIndex])

  const commitEdit = useCallback(
    (index: number) => {
      const parsed = parseFloat(inputValue)
      if (!isNaN(parsed)) {
        const clamped = Math.max(min, Math.min(max, parsed))
        const snapped = stepValues
          ? stepValues[nearestStepIndex(clamped, stepValues)]
          : Math.round((clamped - min) / step) * step + min
        onCommitEdit(index, snapped)
      } else {
        onCancelEdit()
      }
    },
    [inputValue, min, max, step, stepValues, onCommitEdit, onCancelEdit]
  )

  const renderValue = (index: number) => {
    if (editingIndex === index) {
      return (
        <span className="inline-grid text-[13px]">
          <span
            className="invisible col-start-1 row-start-1"
            style={{ fontVariationSettings: fontWeights.medium }}
            aria-hidden="true"
          >
            {label ? `${label}: ` : ""}
            {formatValue(max)}
          </span>
          <span className="col-start-1 row-start-1 flex items-center gap-1">
            {label && <span className="text-muted-foreground">{label}:</span>}
            <input
              ref={inputRef}
              type="number"
              value={inputValue}
              min={min}
              max={max}
              step={stepValues ? "any" : step}
              onChange={(e) => setInputValue(e.target.value)}
              onBlur={() => commitEdit(index)}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitEdit(index)
                if (e.key === "Escape") onCancelEdit()
              }}
              aria-label={`Edit slider value${isRange ? (index === 0 ? " (start)" : " (end)") : ""}`}
              className={cn(
                "w-[5ch] border-b border-border bg-transparent text-center text-foreground outline-none",
                shape.input
              )}
              style={{ fontVariationSettings: fontWeights.medium }}
            />
          </span>
        </span>
      )
    }

    return (
      <span
        className="cursor-text select-none"
        onClick={() => onStartEdit(index)}
      >
        {formatValue(values[index])}
      </span>
    )
  }

  const widestValue = isRange
    ? `${label ? `${label}: ` : ""}${formatValue(max)} — ${formatValue(max)}`
    : `${label ? `${label}: ` : ""}${formatValue(max)}`

  return (
    <span
      className={cn(
        "inline-grid shrink-0 text-[13px] leading-none text-muted-foreground transition-[font-variation-settings] duration-100",
        "tabular-nums"
      )}
      style={{
        fontVariationSettings: isInteracting
          ? fontWeights.medium
          : fontWeights.normal
      }}
    >
      <span
        className="invisible col-start-1 row-start-1 whitespace-nowrap"
        style={{ fontVariationSettings: fontWeights.medium }}
        aria-hidden="true"
      >
        {widestValue}
      </span>
      <span className="col-start-1 row-start-1 whitespace-nowrap">
        {label && editingIndex === null && (
          <span className="text-muted-foreground">{label}: </span>
        )}
        {isRange ? (
          <>
            {renderValue(0)}
            <span className="mx-1 text-muted-foreground/50">—</span>
            {renderValue(1)}
          </>
        ) : (
          renderValue(0)
        )}
      </span>
    </span>
  )
}

type TooltipValueProps = {
  value: number
  formatValue: (v: number) => string
  motionX: MotionValue<number>
}

function TooltipValue({ value, formatValue, motionX }: TooltipValueProps) {
  const shape = useShape()
  const tooltipX = useTransform(motionX, (x) => x + THUMB_SIZE / 2)
  return (
    <motion.div
      className="pointer-events-none absolute z-20 -translate-x-1/2"
      style={{
        x: tooltipX,
        top: -16
      }}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4, transition: spring.fast.exit }}
      transition={spring.fast}
    >
      <span
        className={cn(
          "bg-foreground px-2 py-1 text-[12px] whitespace-nowrap text-background tabular-nums",
          shape.bg
        )}
        style={{ fontVariationSettings: fontWeights.medium }}
      >
        {formatValue(value)}
      </span>
    </motion.div>
  )
}

function Slider({
  range,
  value,
  onChange,
  min: minProp = 0,
  max: maxProp = 100,
  step = 1,
  steps,
  showSteps = false,
  showValue = true,
  valuePosition = "left",
  formatValue = String,
  label,
  endLabels,
  disabled = false,
  trackClassName,
  trackStyle,
  fillClassName,
  fillStyle,
  hideFill = false,
  thumbColor,
  thumbBorderColor,
  className,
  ref,
  ...props
}: SliderProps) {
  const isRange = range === true
  const values = isRange ? value : [value]
  const shape = useShape()

  const stepsKey = steps ? steps.join(",") : ""
  const stepValues = useMemo(() => {
    if (!stepsKey) return null
    const parsed = Array.from(new Set(stepsKey.split(",").map(Number))).sort(
      (a, b) => a - b
    )
    return parsed.length > 1 ? parsed : null
  }, [stepsKey])
  const min = stepValues ? stepValues[0] : minProp
  const max = stepValues ? stepValues[stepValues.length - 1] : maxProp

  const trackRef = useRef<HTMLDivElement>(null)
  const trackWidthRef = useRef(0)
  const dragging = useRef(false)
  const activeDragThumb = useRef<number>(0)
  const valuesRef = useRef(values)
  const minRef = useRef(min)
  const maxRef = useRef(max)
  valuesRef.current = values
  minRef.current = min
  maxRef.current = max

  const [isHovered, setIsHovered] = useState(false)
  const [isPressed, setIsPressed] = useState(false)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [hoverPreview, setHoverPreview] = useState<{
    left: number
    width: number
    snappedValue: number
    cursorX: number
  } | null>(null)
  const [focusedThumb, setFocusedThumb] = useState<number | null>(null)
  const [showHoverTooltip, setShowHoverTooltip] = useState(false)
  const hoverDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (isHovered) {
      hoverDelayRef.current = window.setTimeout(
        () => setShowHoverTooltip(true),
        100
      )
    } else {
      if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current)
      setShowHoverTooltip(false)
    }
    return () => {
      if (hoverDelayRef.current) clearTimeout(hoverDelayRef.current)
    }
  }, [isHovered])

  const motionX0 = useMotionValue(0)
  const motionX1 = useMotionValue(0)

  const fillLeft = useTransform(motionX0, (x) =>
    isRange ? x + THUMB_SIZE / 2 - TRACK_INSET : 0
  )
  const fillWidthSingle = useTransform(
    motionX0,
    (x) => x + THUMB_SIZE / 2 - TRACK_INSET
  )
  const fillWidthRange = useTransform<number, number>(
    [motionX0, motionX1],
    ([x0, x1]) => x1 - x0
  )
  const fillWidth = isRange ? fillWidthRange : fillWidthSingle

  const stepDotsMaskSingle = useTransform(motionX0, (x) => {
    const edge = x + THUMB_SIZE / 2
    return `linear-gradient(to right, transparent ${edge}px, black ${edge + 2}px)`
  })
  const stepDotsMaskRange = useTransform<number, string>(
    [motionX0, motionX1],
    ([x0, x1]) => {
      const left = x0 + THUMB_SIZE / 2
      const right = x1 + THUMB_SIZE / 2
      return `linear-gradient(to right, black ${left - 2}px, transparent ${left}px, transparent ${right}px, black ${right + 2}px)`
    }
  )
  const stepDotsMask = isRange ? stepDotsMaskRange : stepDotsMaskSingle

  const computeHoverPreview = useCallback(
    (cursorX: number, trackWidth: number) => {
      const usable = trackWidth - THUMB_SIZE
      const rawPx = cursorX - THUMB_SIZE / 2
      const clampedPx = Math.max(0, Math.min(usable, rawPx))
      const rawVal = usable > 0 ? (clampedPx / usable) * (max - min) + min : min
      const snappedVal = stepValues
        ? stepValues[nearestStepIndex(rawVal, stepValues)]
        : Math.max(
            min,
            Math.min(max, Math.round((rawVal - min) / step) * step + min)
          )
      const snappedPercent = max === min ? 0 : (snappedVal - min) / (max - min)
      const snappedX = THUMB_SIZE / 2 + snappedPercent * usable

      const c0 = motionX0.get() + THUMB_SIZE / 2
      const c1 = motionX1.get() + THUMB_SIZE / 2
      const nearestIdx = isRange
        ? Math.abs(snappedX - c0) <= Math.abs(snappedX - c1)
          ? 0
          : 1
        : 0
      const nearest = nearestIdx === 0 ? c0 : c1

      const edgeX =
        snappedVal === min ? 0 : snappedVal === max ? trackWidth : snappedX
      const left = Math.min(nearest, edgeX)
      const width = Math.abs(edgeX - nearest)
      setHoverPreview({
        left,
        width,
        snappedValue: snappedVal,
        cursorX: snappedX
      })
    },
    [min, max, step, stepValues, isRange, motionX0, motionX1]
  )

  const initialSyncDone = useRef(false)
  const [ready, setReady] = useState(false)
  useLayoutEffect(() => {
    const el = trackRef.current
    if (!el || initialSyncDone.current) return
    const w = el.offsetWidth
    trackWidthRef.current = w
    const px0 = valueToPixel(values[0], min, max, w)
    motionX0.set(px0)
    if (isRange && values[1] !== undefined) {
      const px1 = valueToPixel(values[1], min, max, w)
      motionX1.set(px1)
    }
    initialSyncDone.current = true
    setReady(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const el = trackRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      const w = entry.contentRect.width
      trackWidthRef.current = w
      if (!dragging.current && initialSyncDone.current) {
        const v = valuesRef.current
        const mn = minRef.current
        const mx = maxRef.current
        const px0 = valueToPixel(v[0], mn, mx, w)
        animate(motionX0, px0, spring.moderate)
        if (isRange && v[1] !== undefined) {
          const px1 = valueToPixel(v[1], mn, mx, w)
          animate(motionX1, px1, spring.moderate)
        }
      }
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [isRange, motionX0, motionX1])

  const valuesKey = values.join(",")
  useEffect(() => {
    if (!initialSyncDone.current) return
    if (dragging.current) return
    const tw = trackWidthRef.current
    if (tw <= 0) return
    const v = valuesRef.current
    const px0 = valueToPixel(v[0], min, max, tw)
    animate(motionX0, px0, spring.moderate)
    if (isRange && v[1] !== undefined) {
      const px1 = valueToPixel(v[1], min, max, tw)
      animate(motionX1, px1, spring.moderate)
    }
  }, [valuesKey, min, max, isRange, motionX0, motionX1])

  const clampForRange = useCallback(
    (px: number, thumbIndex: number): number => {
      if (!isRange) return px
      if (thumbIndex === 0) {
        return Math.min(px, motionX1.get() - THUMB_SIZE * 0.5)
      } else {
        return Math.max(px, motionX0.get() + THUMB_SIZE * 0.5)
      }
    },
    [isRange, motionX0, motionX1]
  )

  const emitChange = useCallback(
    (thumbIndex: number, newValue: number) => {
      if (isRange) {
        const newValues: [number, number] = [value[0], value[1]]
        newValues[thumbIndex] = newValue
        onChange(newValues)
      } else {
        onChange(newValue)
      }
    },
    [isRange, value, onChange]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return
      if (e.pointerType === "mouse" && e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()

      const trackEl = trackRef.current
      if (!trackEl) return
      const trackRect = trackEl.getBoundingClientRect()
      const layoutWidth = trackEl.offsetWidth
      if (layoutWidth <= 0 || trackRect.width <= 0) return
      const scale = trackRect.width / layoutWidth
      const localX = (e.clientX - trackRect.left) / scale - THUMB_SIZE / 2
      const clamped = Math.max(0, Math.min(layoutWidth - THUMB_SIZE, localX))

      if (isRange) {
        const dist0 = Math.abs(clamped - motionX0.get())
        const dist1 = Math.abs(clamped - motionX1.get())
        activeDragThumb.current = dist0 <= dist1 ? 0 : 1
      } else {
        activeDragThumb.current = 0
      }

      dragging.current = true
      setIsPressed(true)

      const motionX = activeDragThumb.current === 0 ? motionX0 : motionX1

      const snappedValue = pixelToValue(
        clamped,
        min,
        max,
        step,
        layoutWidth,
        stepValues
      )
      const snappedPx = valueToPixel(snappedValue, min, max, layoutWidth)

      const finalPx = clampForRange(snappedPx, activeDragThumb.current)
      animate(motionX, finalPx, spring.moderate)

      const finalValue = pixelToValue(
        finalPx,
        min,
        max,
        step,
        layoutWidth,
        stepValues
      )
      emitChange(activeDragThumb.current, finalValue)

      ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    },
    [
      disabled,
      isRange,
      min,
      max,
      step,
      stepValues,
      motionX0,
      motionX1,
      clampForRange,
      emitChange
    ]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragging.current) return
      e.stopPropagation()
      const trackEl = trackRef.current
      if (!trackEl) return
      const trackRect = trackEl.getBoundingClientRect()
      const layoutWidth = trackEl.offsetWidth
      if (layoutWidth <= 0 || trackRect.width <= 0) return
      const scale = trackRect.width / layoutWidth
      const localX = (e.clientX - trackRect.left) / scale - THUMB_SIZE / 2
      const clamped = Math.max(0, Math.min(layoutWidth - THUMB_SIZE, localX))

      const motionX = activeDragThumb.current === 0 ? motionX0 : motionX1

      const snappedValue = pixelToValue(
        clamped,
        min,
        max,
        step,
        layoutWidth,
        stepValues
      )
      const snappedPx = valueToPixel(snappedValue, min, max, layoutWidth)
      const finalPx = clampForRange(snappedPx, activeDragThumb.current)
      motionX.set(finalPx)

      const finalValue = pixelToValue(
        finalPx,
        min,
        max,
        step,
        layoutWidth,
        stepValues
      )
      emitChange(activeDragThumb.current, finalValue)
    },
    [min, max, step, stepValues, motionX0, motionX1, clampForRange, emitChange]
  )

  const handlePointerUp = useCallback(() => {
    if (!dragging.current) return
    dragging.current = false
    setIsPressed(false)
    setHoverPreview(null)

    const tw = trackWidthRef.current
    const motionX = activeDragThumb.current === 0 ? motionX0 : motionX1
    const currentPx = motionX.get()
    const snapped = pixelToValue(currentPx, min, max, step, tw, stepValues)
    const snappedPx = valueToPixel(snapped, min, max, tw)
    animate(motionX, snappedPx, spring.moderate)
  }, [min, max, step, stepValues, motionX0, motionX1])

  const handleRadixChange = useCallback(
    (newValues: ReadonlyArray<number>) => {
      if (dragging.current) return
      const mapped = stepValues
        ? newValues.map((i) => stepValues[Math.round(i)])
        : newValues
      if (isRange) {
        if (mapped.length === 2) onChange([mapped[0], mapped[1]])
      } else {
        onChange(mapped[0])
      }
    },
    [isRange, onChange, stepValues]
  )

  const handleStartEdit = useCallback((index: number) => {
    setEditingIndex(index)
  }, [])

  const handleCommitEdit = useCallback(
    (index: number, v: number) => {
      emitChange(index, v)
      setEditingIndex(null)
    },
    [emitChange]
  )

  const handleCancelEdit = useCallback(() => {
    setEditingIndex(null)
  }, [])

  const stepDots = useMemo(
    () =>
      showSteps
        ? stepValues
          ? stepValues.map((v) => ({
              value: v,
              percent: max === min ? 0 : (v - min) / (max - min)
            }))
          : Array.from(
              { length: Math.round((max - min) / step) + 1 },
              (_, i) => {
                const v = min + i * step
                const percent = (v - min) / (max - min)
                return { value: v, percent }
              }
            )
        : [],
    [showSteps, min, max, step, stepValues]
  )

  const isInteracting = isHovered || isPressed

  const thumbAriaLabel = (index: number): string | undefined => {
    if (!isRange) return label
    if (!label) return index === 0 ? "Minimum" : "Maximum"
    return index === 0 ? `${label} minimum` : `${label} maximum`
  }

  const valueDisplay = showValue && valuePosition !== "tooltip" && (
    <ValueDisplay
      values={values}
      editingIndex={editingIndex}
      onStartEdit={handleStartEdit}
      onCommitEdit={handleCommitEdit}
      onCancelEdit={handleCancelEdit}
      min={min}
      max={max}
      step={step}
      stepValues={stepValues}
      formatValue={formatValue}
      label={label}
      isRange={isRange}
      isInteracting={isInteracting}
    />
  )

  const renderVisualThumb = (index: number) => {
    const motionX = index === 0 ? motionX0 : motionX1
    return (
      <motion.span
        key={`visual-thumb-${index}`}
        className="pointer-events-none flex items-center justify-center"
        style={{
          width: THUMB_SIZE,
          height: THUMB_SIZE,
          marginTop: -THUMB_SIZE / 2,
          x: motionX,
          position: "absolute",
          top: "50%",
          left: 0,
          zIndex: 10
        }}
        initial={false}
      >
        <motion.span
          className="block rounded-full"
          initial={false}
          animate={{
            width: THUMB_SIZE_REST,
            height: THUMB_SIZE_REST
          }}
          transition={spring.fast}
          style={{
            backgroundColor: thumbColor ?? "white",
            boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
            border: thumbBorderColor
              ? `1px solid ${thumbBorderColor}`
              : undefined
          }}
        />
        <motion.span
          className="pointer-events-none absolute rounded-full border border-[color:var(--focus-ring,#6B97FF)]"
          initial={false}
          animate={{
            opacity: focusedThumb === index ? 1 : 0,
            width: THUMB_SIZE + 4,
            height: THUMB_SIZE + 4
          }}
          transition={spring.fast}
        />
      </motion.span>
    )
  }

  return (
    <div
      ref={ref}
      className={cn(
        "flex w-full touch-none flex-col gap-0 overflow-visible select-none",
        valuePosition === "left" || valuePosition === "right"
          ? "mb-2 flex-row items-center gap-2"
          : "flex-col",
        disabled && "pointer-events-none opacity-50",
        className
      )}
      {...props}
    >
      {(valuePosition === "top" || valuePosition === "left") && valueDisplay}

      <div
        className="relative flex-1 overflow-visible"
        style={{
          height:
            valuePosition === "left" || valuePosition === "right"
              ? THUMB_SIZE + 16
              : THUMB_SIZE + (valuePosition === "tooltip" ? 16 : 0),
          paddingTop: valuePosition === "tooltip" ? 16 : 0
        }}
        onPointerEnter={() => setIsHovered(true)}
        onPointerLeave={() => {
          setIsHovered(false)
          setHoverPreview(null)
        }}
        onMouseMove={(e) => {
          if (dragging.current) return
          const trackEl = trackRef.current
          if (!trackEl) return
          const trackRect = trackEl.getBoundingClientRect()
          const layoutWidth = trackEl.offsetWidth
          if (layoutWidth <= 0 || trackRect.width <= 0) return
          const scale = trackRect.width / layoutWidth
          const layoutX = (e.clientX - trackRect.left) / scale
          const clamped = Math.max(0, Math.min(layoutWidth, layoutX))
          computeHoverPreview(clamped, layoutWidth)
        }}
      >
        {showValue && valuePosition === "tooltip" && (
          <AnimatePresence>
            {isInteracting && (
              <TooltipValue
                key="tooltip-0"
                value={values[0]}
                formatValue={formatValue}
                motionX={motionX0}
              />
            )}
            {isInteracting && isRange && values[1] !== undefined && (
              <TooltipValue
                key="tooltip-1"
                value={values[1]}
                formatValue={formatValue}
                motionX={motionX1}
              />
            )}
          </AnimatePresence>
        )}

        <SliderPrimitive.Root
          value={
            stepValues
              ? values.map((v) => nearestStepIndex(v, stepValues))
              : values
          }
          onValueChange={(v) => handleRadixChange(v)}
          min={stepValues ? 0 : min}
          max={stepValues ? stepValues.length - 1 : max}
          step={stepValues ? 1 : step}
          disabled={disabled}
          className="pointer-events-none absolute inset-0 opacity-0"
          style={{ height: THUMB_SIZE }}
        >
          <SliderPrimitive.Control className="h-full w-full">
            <SliderPrimitive.Track className="h-full w-full">
              <SliderPrimitive.Indicator />
            </SliderPrimitive.Track>
            <SliderPrimitive.Thumb
              index={0}
              aria-label={thumbAriaLabel(0)}
              getAriaValueText={
                stepValues ? () => formatValue(values[0]) : undefined
              }
              className="block outline-none"
              style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
              onFocus={(e) => {
                if ((e.currentTarget as HTMLElement).matches(":focus-visible"))
                  setFocusedThumb(0)
              }}
              onBlur={() =>
                setFocusedThumb((prev) => (prev === 0 ? null : prev))
              }
            />
            {isRange && (
              <SliderPrimitive.Thumb
                index={1}
                aria-label={thumbAriaLabel(1)}
                getAriaValueText={
                  stepValues ? () => formatValue(values[1]) : undefined
                }
                className="block outline-none"
                style={{ width: THUMB_SIZE, height: THUMB_SIZE }}
                onFocus={(e) => {
                  if (
                    (e.currentTarget as HTMLElement).matches(":focus-visible")
                  )
                    setFocusedThumb(1)
                }}
                onBlur={() =>
                  setFocusedThumb((prev) => (prev === 1 ? null : prev))
                }
              />
            )}
          </SliderPrimitive.Control>
        </SliderPrimitive.Root>

        <div
          ref={trackRef}
          className="relative w-full cursor-ew-resize py-2"
          style={{ height: THUMB_SIZE + 16, opacity: ready ? 1 : 0 }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <div
            className="absolute cursor-ew-resize"
            style={{ left: -8, right: -8, top: 0, bottom: 0 }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          />
          <AnimatePresence>
            {hoverPreview &&
              showHoverTooltip &&
              !isPressed &&
              valuePosition !== "tooltip" && (
                <motion.div
                  key="hover-tooltip"
                  className="pointer-events-none absolute z-20 -translate-x-1/2"
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4, transition: spring.fast.exit }}
                  transition={spring.fast}
                  style={{
                    left: hoverPreview.cursorX,
                    top: -20
                  }}
                >
                  <span
                    className={cn(
                      "bg-foreground px-2 py-1 text-[12px] whitespace-nowrap text-background tabular-nums",
                      shape.bg
                    )}
                    style={{ fontVariationSettings: fontWeights.medium }}
                  >
                    {formatValue(hoverPreview.snappedValue)}
                  </span>
                </motion.div>
              )}
          </AnimatePresence>

          <motion.div
            className={cn(
              "absolute overflow-hidden rounded-full border border-border",
              trackClassName
            )}
            initial={false}
            animate={{
              height: TRACK_BG_HEIGHT,
              top: 8 + (THUMB_SIZE - TRACK_BG_HEIGHT) / 2
            }}
            transition={spring.fast}
            style={{
              left: TRACK_INSET,
              right: TRACK_INSET,
              backgroundColor: "transparent",
              ...trackStyle
            }}
          >
            {!hideFill && (
              <motion.div
                className={cn(
                  "absolute h-full bg-selected/50 dark:bg-accent/40",
                  fillClassName
                )}
                style={{
                  left: fillLeft,
                  width: fillWidth,
                  ...fillStyle
                }}
              />
            )}

            <motion.div
              className="pointer-events-none absolute z-[2] h-full"
              initial={false}
              animate={{
                opacity: hoverPreview && !isPressed ? 1 : 0
              }}
              transition={{
                opacity: { duration: 0.15 }
              }}
              style={{
                left: hoverPreview ? hoverPreview.left - TRACK_INSET : 0,
                width: hoverPreview ? hoverPreview.width : 0,
                borderRadius:
                  hoverPreview && hoverPreview.cursorX > hoverPreview.left
                    ? "0 9999px 9999px 0"
                    : "9999px 0 0 9999px",
                backgroundColor:
                  "color-mix(in srgb, var(--color-accent) 40%, transparent)"
              }}
            />
          </motion.div>

          {stepDots.length > 0 && (
            <motion.div
              className="pointer-events-none absolute right-0 left-0"
              style={{
                top: 8 + (THUMB_SIZE - TRACK_BG_HEIGHT) / 2,
                height: TRACK_BG_HEIGHT,
                WebkitMaskImage: stepDotsMask,
                maskImage: stepDotsMask
              }}
            >
              {stepDots.map(({ value: v, percent }) => (
                <div
                  key={v}
                  className="pointer-events-none absolute flex items-center justify-center"
                  style={{
                    left: `calc(${THUMB_SIZE / 2}px + ${percent} * (100% - ${THUMB_SIZE}px))`,
                    top: "50%",
                    width: 0,
                    height: 0
                  }}
                >
                  <motion.div
                    className="flex-shrink-0 rounded-full"
                    initial={false}
                    animate={{
                      width: isHovered ? DOT_SIZE * 1.25 : DOT_SIZE,
                      height: isHovered ? DOT_SIZE * 1.25 : DOT_SIZE
                    }}
                    transition={spring.moderate}
                    style={{
                      backgroundColor: "var(--muted-foreground)",
                      opacity: 0.3
                    }}
                  />
                </div>
              ))}
            </motion.div>
          )}

          {renderVisualThumb(0)}
          {isRange && renderVisualThumb(1)}
        </div>

        {endLabels && (
          <div
            data-slot="slider-end-labels"
            className="mt-1 flex items-baseline justify-between gap-3 text-[11px] leading-4 text-muted-foreground"
          >
            <span>{endLabels[0]}</span>
            <span className="text-right">{endLabels[1]}</span>
          </div>
        )}
      </div>

      {(valuePosition === "bottom" || valuePosition === "right") &&
        valueDisplay}
    </div>
  )
}

export { Slider }
export type { SliderProps }
