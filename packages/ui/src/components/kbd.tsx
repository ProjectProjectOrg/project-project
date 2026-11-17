import type { HotkeyChord } from "@tanstack/react-hotkeys"
import * as React from "react"

import type { IconComponent } from "../lib/icon"
import { installKeyCapHighlight } from "../lib/keyCapHighlight"
import {
  shortcutCaps,
  useIsMac,
  type KeyLabels,
  type ShortcutCap
} from "../lib/shortcuts"
import { cn } from "../lib/utils"
import {
  ArrowBigUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowRightToLine,
  ArrowUp,
  ChevronUp,
  Command,
  CornerDownLeft,
  Delete,
  Option
} from "./icons"

// A key takes its colours from where it sits: the glyph is the surrounding
// text colour (so it keeps that text's contrast) and the fill is a tint of
// it. One Kbd reads right on a field, in a menu row, on a primary button and
// in the ink tooltip, with no per-place overrides.
// Corners are half the key's height in the button shape; a soft glow along
// the bottom inside edge (--kbd-glow) gives it a little depth, like a key
// catching light.
const KBD_SIZES = {
  default: "h-5 min-w-5 rounded-[10px] px-1.5 text-micro",
  sm: "h-4 min-w-4 rounded-[8px] px-1 text-micro-compact"
} as const

export type KbdSize = keyof typeof KBD_SIZES

function Kbd({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"kbd"> & { size?: KbdSize }) {
  return (
    <kbd
      data-slot="kbd"
      data-size={size}
      className={cn(
        "pointer-events-none inline-flex w-fit shrink-0 items-center justify-center gap-0.5 font-sans select-none [corner-shape:var(--button-corner)]",
        "bg-[color-mix(in_oklab,currentColor_8%,transparent)] shadow-[inset_0_-1px_2px_var(--kbd-glow)]",
        // On a button the light comes from the button's own ink, so a key on
        // a dark primary button doesn't get a white bevel.
        "[[data-slot=button]_&]:shadow-[inset_0_-1px_2px_color-mix(in_oklab,currentColor_20%,transparent)]",
        // Centre the capitals, not the line box: trim the text to cap height
        // and baseline so flex centring lands on the letters.
        "[text-box:trim-both_cap_alphabetic]",
        // Lit while its key is held (keyCapHighlight sets data-pressed);
        // it fades back out.
        "transition-colors duration-150 data-pressed:bg-[color-mix(in_oklab,currentColor_24%,transparent)] data-pressed:duration-0",
        KBD_SIZES[size],
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex shrink-0 items-center gap-0.5", className)}
      {...props}
    />
  )
}

// Glyph caps draw as icons, so they sit on the same baseline and weight as
// letters; the glyph itself stays in the text for screen readers.
const GLYPH_ICONS = {
  "↵": CornerDownLeft,
  "⇥": ArrowRightToLine,
  "←": ArrowLeft,
  "→": ArrowRight,
  "↑": ArrowUp,
  "↓": ArrowDown,
  "⌫": Delete,
  "⌘": Command,
  "⇧": ArrowBigUp,
  "⌥": Option,
  "⌃": ChevronUp
} satisfies Readonly<Record<string, IconComponent>>

const isGlyph = (cap: string): cap is keyof typeof GLYPH_ICONS =>
  Object.hasOwn(GLYPH_ICONS, cap)

function KbdCap({ cap }: Readonly<{ cap: string }>) {
  if (!isGlyph(cap)) return cap
  const Icon = GLYPH_ICONS[cap]
  return (
    <>
      {/* An explicit size, so a menu row's or a button's own svg sizing
          can't blow the glyph up. */}
      <Icon
        aria-hidden
        strokeWidth={2}
        className="size-3 [[data-size=sm]>&]:size-2.5"
      />
      <span className="sr-only">{cap}</span>
    </>
  )
}

type KbdCapsProps = Omit<React.ComponentProps<"kbd">, "children"> &
  Readonly<{ size?: KbdSize }>

// Caps in a group. Each one carries the key that lights it while held; the
// highlight listener is installed once, by the first shortcut on screen.
// Hidden on touch screens, where there is no keyboard to press them on.
function KbdCaps({
  caps,
  size = "default",
  className,
  ...props
}: KbdCapsProps & Readonly<{ caps: ReadonlyArray<ShortcutCap> }>) {
  React.useEffect(installKeyCapHighlight, [])
  return (
    <KbdGroup
      data-slot="kbd-shortcut"
      className={cn("align-middle pointer-coarse:hidden", className)}
      {...props}
    >
      {caps.map((cap, i) => (
        <Kbd
          key={`${cap.label}-${i}`}
          size={size}
          data-key={cap.key}
          data-sequence-start={cap.sequenceStart ? "" : undefined}
        >
          <KbdCap cap={cap.label} />
        </Kbd>
      ))}
    </KbdGroup>
  )
}

export type KbdShortcutProps = KbdCapsProps &
  Readonly<{
    // One chord ("mod+shift+p", "esc", "Mod+K") or a sequence of chords
    // (["G", "B"]), as TanStack Hotkeys declares them.
    keys: string | ReadonlyArray<string>
    // Names for keys off a Mac (Ctrl, Enter, …); the app passes its messages.
    keyLabels: KeyLabels
  }>

// A shortcut as keys: ⌘ ⇧ P on a Mac, Ctrl Shift P elsewhere, one Kbd per
// key.
function KbdShortcut({ keys, keyLabels, ...props }: KbdShortcutProps) {
  const mac = useIsMac()
  return <KbdCaps caps={shortcutCaps(keys, mac, keyLabels)} {...props} />
}

const NUMBER_KEYS = [
  "1",
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "0"
] as const satisfies ReadonlyArray<HotkeyChord>

// The digit that picks the nth choice in a list (1 to 9, then 0), if any.
const numberKey = (index: number): HotkeyChord | undefined => NUMBER_KEYS[index]

// A digit's cap, for numbered choices. Digits need no key names.
function KbdNumber({
  digit,
  ...props
}: KbdCapsProps & Readonly<{ digit: string }>) {
  return (
    <KbdCaps
      caps={[{ label: digit, key: digit, sequenceStart: false }]}
      {...props}
    />
  )
}

export { Kbd, KbdGroup, KbdNumber, KbdShortcut, numberKey, type KeyLabels }
