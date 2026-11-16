import { STRONG_RING } from "@pp/shared"
import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useMemo,
  useRef
} from "react"

import { cn } from "../lib/utils"
import { Button } from "./button"
import { HexSwatch, hexHeight } from "./hex-swatch"
import type { IconProps } from "./icons"
import { popupSurfaceClass } from "./menu-styles"

/*
 * The ColorPicker's "No colour" and "Multicolour" buttons: ghost buttons on
 * a small surface under the honeycomb, each with a hexagon for an icon.
 *
 * - No colour is a choice, like a colour: picking it closes the grid.
 * - Multicolour is a toggle. Off, its icon is grey. On, the grid picks
 *   several colours (up to the picker's limit) and the icon shows them, or
 *   the whole strong ring while none is picked (seeded colours).
 *
 * Whichever is the current choice travels like a picked dot: its hexagon
 * flies out of the trigger to the button's icon on open, and back into the
 * trigger on close. Each has a trigger-sized hexagon for that trip (its
 * flyer), parked on its icon and shown only while it travels; theme.css
 * runs the trip.
 */

export type Extra = "clear" | "multi"

// The whole strong ring: Multicolour with no colour picked.
export const SPECTRUM = `conic-gradient(from 0deg, ${[
  ...STRONG_RING,
  STRONG_RING[0]
]
  .map((swatch) => swatch.oklch)
  .join(", ")})`

// Multicolour's fill: the picked colours round the hexagon, or the whole
// ring while none is picked.
export const multiFill = (colors: ReadonlyArray<string>) => {
  if (colors.length === 0) return SPECTRUM
  if (colors.length === 1) return colors[0]
  return `conic-gradient(from 0deg, ${[...colors, colors[0]].join(", ")})`
}

// Multicolour's icon blends whenever its colours change: the gradient is
// always three registered colours (--m1…--m3, theme.css), so adding or
// removing a pick eases every step to its new colour. No picks: three
// hues a third of the ring apart, standing in for the whole ring.
const UNPICKED = [STRONG_RING[0], STRONG_RING[4], STRONG_RING[8]].map(
  (swatch) => swatch.oklch
)
const LIVE_FILL =
  "conic-gradient(from 0deg, var(--m1), var(--m2), var(--m3), var(--m1))"
const liveVars = (colors: ReadonlyArray<string>) => {
  const [first, second = first, third = second] =
    colors.length === 0 ? UNPICKED : colors
  return { "--m1": first, "--m2": second, "--m3": third }
}

const ICON = 12
const ICON_HEIGHT = hexHeight(ICON)
const TRIGGER = 24
const TRIGGER_HEIGHT = hexHeight(TRIGGER)

// A 28px button on the surface's 2px padding.
export const EXTRAS_HEIGHT = 32

// An element's layout offset inside an ancestor, ignoring transforms (the
// open and close motion moves things with `translate`).
const offsetWithin = (element: HTMLElement, ancestor: HTMLElement) => {
  let x = 0
  let y = 0
  let node: Element | null = element
  while (node instanceof HTMLElement && node !== ancestor) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent
  }
  return { x, y }
}

// Button takes its leading icon as a component, so the Multicolour fill
// reaches the icon through context.
const MultiFillContext = createContext<Readonly<{
  colors: ReadonlyArray<string>
  on: boolean
}> | null>(null)

function IconHex({
  fill,
  live
}: Readonly<{
  fill: string | undefined
  // Multicolour's icon: grey while off, blending as its colours change.
  live?: Readonly<{ on: boolean; colors: ReadonlyArray<string> }>
}>) {
  const id = useId()
  const swatch = (
    <HexSwatch
      width={ICON}
      litId={`pp-lit-${id.replace(/:/g, "")}`}
      empty={fill === undefined && live === undefined}
      fill={live ? LIVE_FILL : fill}
    />
  )
  return (
    <span
      aria-hidden
      data-slot="color-picker-chip-icon"
      className="relative shrink-0"
      style={{ width: ICON, height: ICON_HEIGHT }}
    >
      {live ? (
        <span
          data-slot="color-picker-multi-icon"
          data-on={live.on || undefined}
          className={cn("absolute inset-0", !live.on && "grayscale")}
          style={liveVars(live.colors)}
        >
          {swatch}
        </span>
      ) : (
        swatch
      )}
    </span>
  )
}

function NoColourIcon(_: IconProps) {
  return <IconHex fill={undefined} />
}

function MultiIcon(_: IconProps) {
  const multi = use(MultiFillContext)
  return (
    <IconHex
      fill={SPECTRUM}
      live={{ on: multi?.on === true, colors: multi?.colors ?? [] }}
    />
  )
}

function Flyer({
  kind,
  active,
  fill,
  colors,
  litId,
  rowY
}: Readonly<{
  kind: Extra
  active: boolean
  fill: string | undefined
  // Multicolour's picks: the flyer matches the icon it stands in for.
  colors?: ReadonlyArray<string>
  litId: string
  // The row's own offset, which layout offsets don't include.
  rowY: number
}>) {
  const ref = useRef<HTMLSpanElement | null>(null)
  const multiVars = colors === undefined ? undefined : liveVars(colors)

  // Park on this choice's icon.
  useLayoutEffect(() => {
    const flyer = ref.current
    const popup = flyer?.offsetParent
    if (!flyer || !(popup instanceof HTMLElement)) return
    const icon = popup.querySelector(
      `[data-extra="${kind}"] [data-slot="color-picker-chip-icon"]`
    )
    if (!(icon instanceof HTMLElement)) return
    const { x, y } = offsetWithin(icon, popup)
    flyer.style.setProperty(
      "--from-x",
      `${x + ICON / 2 - popup.offsetWidth / 2}px`
    )
    flyer.style.setProperty(
      "--from-y",
      `${y + ICON_HEIGHT / 2 - popup.offsetHeight / 2 + rowY}px`
    )
  }, [kind, rowY])

  return (
    <span
      ref={ref}
      aria-hidden
      data-slot="color-picker-flyer"
      data-active={active || undefined}
      className="absolute top-1/2 left-1/2"
      style={{
        width: TRIGGER,
        height: TRIGGER_HEIGHT,
        marginLeft: -TRIGGER / 2,
        marginTop: -TRIGGER_HEIGHT / 2,
        "--icon-scale": `${ICON / TRIGGER}`,
        ...multiVars
      }}
    >
      <HexSwatch
        width={TRIGGER}
        litId={litId}
        empty={fill === undefined && colors === undefined}
        fill={colors ? LIVE_FILL : fill}
      />
    </span>
  )
}

// The current choice is outlined like a picked dot, but only if it was the
// choice when the grid opened: one picked to close the grid doesn't need it.
const outlineClass =
  "outline-[1.5px] outline-offset-[1.5px] outline-foreground outline-solid"

export function ColorPickerExtras({
  clear,
  multi,
  current,
  outlined,
  onClear,
  litId,
  y
}: Readonly<{
  clear?: string
  multi?: Readonly<{
    label: string
    on: boolean
    colors: ReadonlyArray<string>
    onToggle: () => void
  }>
  current: Extra | null
  outlined: Extra | null
  onClear: () => void
  litId: string
  // Where the row sits, from the popup's centre.
  y: number
}>) {
  const multiFillValue = useMemo(
    () => (multi ? { colors: multi.colors, on: multi.on } : null),
    [multi]
  )
  return (
    <MultiFillContext value={multiFillValue}>
      <div
        data-slot="color-picker-chips"
        className="absolute inset-x-0 top-1/2 flex justify-center"
        style={{
          marginTop: -EXTRAS_HEIGHT / 2,
          "--x": "0px",
          "--y": `${y}px`,
          "--delay": "60ms"
        }}
      >
        <div
          className={`${popupSurfaceClass} pointer-events-auto flex gap-1 rounded-[16px] p-0.5`}
        >
          {clear === undefined ? null : (
            <Button
              data-extra="clear"
              variant="ghost"
              size="sm"
              leadingIcon={NoColourIcon}
              aria-pressed={current === "clear"}
              onClick={onClear}
              className={outlined === "clear" ? outlineClass : undefined}
            >
              {clear}
            </Button>
          )}
          {multi === undefined ? null : (
            <Button
              data-extra="multi"
              variant="ghost"
              size="sm"
              leadingIcon={MultiIcon}
              aria-pressed={multi.on}
              onClick={multi.onToggle}
              className={outlined === "multi" ? outlineClass : undefined}
            >
              {multi.label}
            </Button>
          )}
        </div>
      </div>
      {clear === undefined ? null : (
        <Flyer
          kind="clear"
          active={current === "clear"}
          fill={undefined}
          litId={`${litId}-clear`}
          rowY={y}
        />
      )}
      {multi === undefined ? null : (
        <Flyer
          kind="multi"
          active={current === "multi"}
          fill={undefined}
          colors={multi.colors}
          litId={`${litId}-multi`}
          rowY={y}
        />
      )}
    </MultiFillContext>
  )
}
