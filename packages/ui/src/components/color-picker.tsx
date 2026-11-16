import { Popover } from "@base-ui/react/popover"
import { NEUTRALS, SOFT_RING, STRONG_RING, type ColorSwatch } from "@pp/shared"
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject
} from "react"

import { useActivityHiddenPortalRef } from "../hooks/useActivityHiddenPortalRef"
import { cn } from "../lib/utils"
import {
  ColorPickerExtras,
  EXTRAS_HEIGHT,
  multiFill
} from "./color-picker-extras"
import { HexSwatch, hexHeight } from "./hex-swatch"

/*
 * ColorPicker: a hexagonal swatch that opens a honeycomb of colours around
 * itself. One hex grid, centred on the trigger: 6 soft colours touching it,
 * 12 strong colours around those (each soft colour sits on the strong
 * colour of its hue) and the 4 neutrals as the row below. Opening sends the
 * trigger's colour out to its own place in the grid; picking brings the
 * picked dot back to the centre as the new value. Optional chips under the
 * grid: "No colour" and "Multicolour" (a choice of its own, not a colour).
 *
 *   <ColorPicker value={tag.color} onChange={recolor}
 *     ariaLabel={m.tags_color_aria_label({ name })}
 *     swatchLabel={(hex) => m.color_swatch_aria_label({ hex })} />
 */

const DOT = 28
const STEP = DOT + 2
// Distance between two rows of the grid.
const ROW = (STEP * Math.sqrt(3)) / 2
const TRIGGER = 24
// Room for a dot to grow on hover without being clipped.
const GROW_ROOM = 8

// Hover: the nearest dot grows (GROW) and leans a little toward the
// pointer (PULL, a share of the distance). REACH sets how fast that fades
// with distance. Computed from the pointer every frame, without easing, so
// nothing lags or settles.
const REACH = 18
const GROW = 0.4
const PULL = 0.12

type Slot = Readonly<{
  x: number
  y: number
  // Rings open one after the other, from the trigger out.
  ring: number
  swatch: ColorSwatch
}>

const at = (degrees: number, radius: number) => ({
  x: Math.cos((degrees * Math.PI) / 180) * radius,
  y: Math.sin((degrees * Math.PI) / 180) * radius
})

// A hue's angle on the grid: 15° (red) at the top, clockwise.
const angleOf = (hue: number) => hue - 105
// The outer ring's corners fall on the even 30° steps, the midpoints of its
// edges on the odd ones.
const isCorner = (hue: number) =>
  Math.abs(Math.round(angleOf(hue) / 30)) % 2 === 0

const colorSlot = (
  swatch: ColorSwatch,
  { x, y }: Readonly<{ x: number; y: number }>,
  ring: number
): Slot => ({ x, y, ring, swatch })

const SLOTS: ReadonlyArray<Slot> = [
  ...SOFT_RING.map((swatch) =>
    colorSlot(swatch, at(angleOf(swatch.hue), STEP), 0)
  ),
  ...STRONG_RING.map((swatch) =>
    colorSlot(
      swatch,
      at(
        angleOf(swatch.hue),
        isCorner(swatch.hue) ? 2 * STEP : Math.sqrt(3) * STEP
      ),
      1
    )
  ),
  ...NEUTRALS.map((swatch, index) =>
    colorSlot(swatch, { x: (index - 1.5) * STEP, y: 3 * ROW }, 2)
  )
]

// "No colour" and "Multicolour", centred under the neutrals.
const EXTRAS_Y = 3 * ROW + hexHeight(DOT) / 2 + 8 + EXTRAS_HEIGHT / 2

// The popup is centred on the trigger, so it reaches as far up as down.
const HALF_WIDTH = 2 * STEP + DOT / 2 + GROW_ROOM
const HALF_HEIGHT = EXTRAS_Y + EXTRAS_HEIGHT / 2 + GROW_ROOM

const same = (a: string | null, b: string) =>
  a !== null && a.toLowerCase() === b.toLowerCase()

const DOT_HEIGHT = hexHeight(DOT)

const currentExtra = (multi: boolean, value: string | null) => {
  if (multi) return "multi" as const
  return value === null ? ("clear" as const) : null
}
const TRIGGER_HEIGHT = hexHeight(TRIGGER)

type ColorPickerProps = Readonly<{
  // The chosen colour as #rrggbb, or null for none.
  value: string | null
  onChange: (hex: string) => void
  // The trigger's and the grid's name.
  ariaLabel: string
  swatchLabel: (hex: string) => string
  onOpenChange?: (open: boolean) => void
  // Pick, then close. Off, the grid stays open to compare colours.
  closeOnSelect?: boolean
  // Start open (the gallery's specimen).
  defaultOpen?: boolean
  // The "No colour" chip; picking it calls onClear.
  clear?: Readonly<{ label: string; onClear: () => void }>
  // How many colours Multicolour may pick. Above 1 the Multicolour toggle
  // shows (with `multi`); 1, the default, picks a single colour.
  limit?: number
  // The Multicolour toggle (projects). While it's on, the grid stays open
  // and each dot adds or removes its colour, up to `limit` (past it, the
  // oldest goes); no colours picked means seeded ones.
  multi?: Readonly<{
    label: string
    on: boolean
    colors: ReadonlyArray<string>
    onToggle: (on: boolean) => void
    onColorsChange: (colors: ReadonlyArray<string>) => void
  }>
  className?: string
  // Pins the trigger's hover, pressed or focus look (the gallery).
  "data-force"?: string
}>

export function ColorPicker({
  value,
  onChange,
  ariaLabel,
  swatchLabel,
  onOpenChange,
  closeOnSelect = true,
  defaultOpen = false,
  clear,
  limit = 1,
  multi: multiProp,
  className,
  "data-force": force
}: ColorPickerProps) {
  const litId = `pp-lit-${useId().replace(/:/g, "")}`
  const [open, setOpen] = useState(defaultOpen)
  // The value when the grid opened: only that dot shows the picked ring. A
  // colour picked to close the grid doesn't need one on its way home.
  const [openedWith, setOpenedWith] = useState(value)
  const multi = limit > 1 ? multiProp : undefined
  const multiOn = multi?.on === true
  const colors = multi?.colors ?? []
  const [openedMulti, setOpenedMulti] = useState(multiOn)
  const portalRef = useActivityHiddenPortalRef()
  const popupRef = useRef<HTMLDivElement>(null)
  const dotRefs = useRef<Array<HTMLButtonElement | null>>([])
  const initialRef = useRef<HTMLButtonElement | null>(null)

  const changeOpen = (next: boolean) => {
    if (next) {
      setOpenedWith(value)
      setOpenedMulti(multiOn)
    }
    setOpen(next)
    onOpenChange?.(next)
  }

  const pick = (hex: string) => {
    if (multi && multiOn) {
      const picked = colors.some((color) => same(color, hex))
      multi.onColorsChange(
        picked
          ? colors.filter((color) => !same(color, hex))
          : [...colors, hex].slice(-limit)
      )
      return
    }
    onChange(hex)
    if (closeOnSelect) changeOpen(false)
  }

  const clearValue = () => {
    clear?.onClear()
    if (closeOnSelect) changeOpen(false)
  }

  useHoverField(open, popupRef, dotRefs, SLOTS)

  // Arrows move to the nearest dot in that direction, across the whole grid.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!isArrow(event.key)) return
    const direction = ARROWS[event.key]
    const from = dotRefs.current.findIndex(
      (dot) => dot === document.activeElement
    )
    if (from === -1) return
    event.preventDefault()
    const target = nearestInDirection(SLOTS, from, direction)
    if (target !== -1) dotRefs.current[target]?.focus()
  }

  const selected = multiOn
    ? -1
    : SLOTS.findIndex((slot) => same(value, slot.swatch.hex))
  const initial = selected === -1 ? 0 : selected
  const triggerEmpty = !multiOn && value === null
  const isPicked = (index: number) =>
    multiOn
      ? colors.some((color) => same(color, SLOTS[index].swatch.hex))
      : index === selected

  return (
    <Popover.Root open={open} onOpenChange={changeOpen}>
      <Popover.Trigger
        aria-label={ariaLabel}
        data-slot="color-picker-trigger"
        data-force={force}
        className={cn(
          "relative w-6 shrink-0 cursor-pointer outline-none motion-safe:active:scale-[0.92]",
          // While open the colour is out in the grid; the trigger shows
          // again as the picked dot lands back on it.
          "[transition:scale_150ms_var(--ease-standard),opacity_0s_160ms] data-popup-open:opacity-0 data-popup-open:[transition:none]",
          className
        )}
        style={{ height: TRIGGER_HEIGHT }}
      >
        <HexSwatch
          width={TRIGGER}
          litId={`${litId}-trigger`}
          empty={triggerEmpty}
          fill={multiOn ? multiFill(colors) : (value ?? undefined)}
        />
      </Popover.Trigger>
      <Popover.Portal ref={portalRef}>
        <Popover.Positioner
          side="bottom"
          align="center"
          // Centre the grid on the trigger.
          sideOffset={-(HALF_HEIGHT + TRIGGER_HEIGHT / 2)}
          collisionPadding={8}
          className="z-50"
        >
          <Popover.Popup
            ref={popupRef}
            data-slot="color-picker"
            initialFocus={initialRef}
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className="pointer-events-none relative outline-none"
            style={{ width: HALF_WIDTH * 2, height: HALF_HEIGHT * 2 }}
          >
            <div role={multiOn ? "group" : "radiogroup"} aria-label={ariaLabel}>
              {SLOTS.map((slot, index) => {
                const isChecked = isPicked(index)
                return (
                  <span
                    key={slot.swatch.hex}
                    data-slot="color-picker-dot"
                    // The value travels home on close; Multicolour's icon
                    // does that instead while it's on.
                    data-value={(!multiOn && isChecked) || undefined}
                    data-ring={
                      multiOn ||
                      !closeOnSelect ||
                      (openedWith !== null &&
                        same(openedWith, slot.swatch.hex)) ||
                      undefined
                    }
                    className="absolute top-1/2 left-1/2"
                    style={{
                      width: DOT,
                      height: DOT_HEIGHT,
                      marginLeft: -DOT / 2,
                      marginTop: -DOT_HEIGHT / 2,
                      "--x": `${slot.x}px`,
                      "--y": `${slot.y}px`,
                      "--delay": `${slot.ring * 20}ms`
                    }}
                  >
                    <button
                      ref={(element) => {
                        dotRefs.current[index] = element
                        if (index === initial) initialRef.current = element
                      }}
                      type="button"
                      // oxlint-disable-next-line jsx-a11y/prefer-tag-over-role -- a styled dot on a hex grid, with roving focus and arrow keys of its own
                      role={multiOn ? "checkbox" : "radio"}
                      aria-checked={isChecked}
                      aria-label={swatchLabel(slot.swatch.hex)}
                      tabIndex={index === initial ? 0 : -1}
                      onClick={() => pick(slot.swatch.hex)}
                      className={cn(
                        "pointer-events-auto relative block size-full cursor-pointer [filter:drop-shadow(0_1px_1px_rgb(0_0_0/0.14))] outline-none",
                        // Pressed: the hexagon (not the button, whose scale
                        // the hover owns) sinks a little, like the trigger.
                        "*:transition-[scale] *:duration-100 *:ease-standard motion-safe:active:*:scale-[0.92]"
                      )}
                    >
                      <HexSwatch
                        width={DOT}
                        litId={litId}
                        fill={slot.swatch.oklch}
                        ink={slot.swatch.L > 0.72 ? "dark" : "light"}
                      />
                    </button>
                  </span>
                )
              })}
            </div>
            {clear || multi ? (
              <ColorPickerExtras
                clear={clear?.label}
                multi={
                  multi && {
                    label: multi.label,
                    on: multiOn,
                    colors,
                    onToggle: () => multi.onToggle(!multiOn)
                  }
                }
                current={currentExtra(multiOn, value)}
                // Outlined only if it was the choice when the grid opened.
                outlined={
                  closeOnSelect
                    ? currentExtra(openedMulti, openedWith)
                    : currentExtra(multiOn, value)
                }
                onClear={clearValue}
                litId={litId}
                y={EXTRAS_Y}
              />
            ) : null}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  )
}

const ARROWS = {
  ArrowRight: [1, 0],
  ArrowLeft: [-1, 0],
  ArrowDown: [0, 1],
  ArrowUp: [0, -1]
} as const satisfies Readonly<Record<string, readonly [number, number]>>

const isArrow = (key: string): key is keyof typeof ARROWS => key in ARROWS

// The closest dot within 60° of the direction, preferring the straightest.
const nearestInDirection = (
  slots: ReadonlyArray<Slot>,
  from: number,
  [dx, dy]: readonly [number, number]
): number => {
  const origin = slots[from]
  let best = -1
  let bestScore = Infinity
  slots.forEach((slot, index) => {
    const vx = slot.x - origin.x
    const vy = slot.y - origin.y
    const distance = Math.hypot(vx, vy)
    if (index === from || distance === 0) return
    const cos = (vx * dx + vy * dy) / distance
    if (cos < 0.5) return
    const score = distance * (2 - cos)
    if (score < bestScore) {
      bestScore = score
      best = index
    }
  })
  return best
}

// Grows the dot nearest the pointer while the grid is open. Every dot's
// closeness is shared out so the nearest takes almost all of it, which hands
// the growth from one dot to the next smoothly as the pointer moves.
function useHoverField(
  open: boolean,
  popupRef: RefObject<HTMLDivElement | null>,
  dotRefs: RefObject<Array<HTMLButtonElement | null>>,
  slots: ReadonlyArray<Slot>
) {
  useEffect(() => {
    if (!open) return undefined
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      return undefined
    let pointer: { x: number; y: number } | null = null
    let presence = 0
    let frame = 0
    const onMove = (event: PointerEvent) => {
      const popup = popupRef.current
      if (!popup) return
      const rect = popup.getBoundingClientRect()
      // Inside a zoomed specimen the grid is drawn larger than its layout.
      const scale = rect.width / popup.offsetWidth || 1
      const x = (event.clientX - rect.left - rect.width / 2) / scale
      const y = (event.clientY - rect.top - rect.height / 2) / scale
      const inside = Math.abs(x) < HALF_WIDTH && Math.abs(y) < HALF_HEIGHT
      pointer = inside ? { x, y } : null
    }
    const tick = () => {
      presence += ((pointer ? 1 : 0) - presence) * 0.3
      if (presence < 0.002) presence = 0
      const px = pointer?.x ?? 0
      const py = pointer?.y ?? 0
      const close = slots.map((slot) =>
        Math.exp(-((px - slot.x) ** 2 + (py - slot.y) ** 2) / (2 * REACH ** 2))
      )
      // Sharpened before sharing out, so the dot under the pointer takes
      // nearly all of it and two dots split it evenly at their midpoint.
      const sharp = close.map((c) => c ** 4)
      const total = sharp.reduce((sum, c) => sum + c, 0) + 1e-9
      slots.forEach((slot, index) => {
        const dot = dotRefs.current[index]
        if (!dot) return
        const near = close[index] * (sharp[index] / total) * presence
        dot.style.scale = `${1 + GROW * near}`
        dot.style.translate = `${(px - slot.x) * PULL * near}px ${(py - slot.y) * PULL * near}px`
        // The picked dot stays on top, so its ring is never covered.
        const holder = dot.parentElement
        if (holder && holder.dataset.value === undefined)
          holder.style.zIndex = `${Math.round(near * 10)}`
      })
      frame = requestAnimationFrame(tick)
    }
    document.addEventListener("pointermove", onMove)
    frame = requestAnimationFrame(tick)
    return () => {
      document.removeEventListener("pointermove", onMove)
      cancelAnimationFrame(frame)
    }
  }, [open, popupRef, dotRefs, slots])
}
