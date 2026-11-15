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
} from "lucide-react"

import type { IconComponent } from "../lib/icon"
import { formatShortcut, useIsMac, type KeyLabels } from "../lib/shortcuts"
import { cn } from "../lib/utils"

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

export type KbdShortcutProps = Omit<React.ComponentProps<"kbd">, "children"> &
  Readonly<{
    // "mod+shift+p", "g+b", "esc", or several: ["mod+k", "/"].
    keys: string | ReadonlyArray<string>
    // Names for keys off a Mac (Ctrl, Enter, …); the app passes its messages.
    keyLabels: KeyLabels
    size?: KbdSize
  }>

// A shortcut as keys: ⌘ ⇧ P on a Mac, Ctrl Shift P elsewhere, one Kbd per
// key.
function KbdShortcut({
  keys,
  keyLabels,
  size = "default",
  className,
  ...props
}: KbdShortcutProps) {
  const mac = useIsMac()
  const caps = [keys].flat().flatMap((k) => formatShortcut(k, mac, keyLabels))
  return (
    <KbdGroup
      data-slot="kbd-shortcut"
      className={cn("align-middle", className)}
      {...props}
    >
      {caps.map((cap, i) => (
        <Kbd key={`${cap}-${i}`} size={size}>
          <KbdCap cap={cap} />
        </Kbd>
      ))}
    </KbdGroup>
  )
}

export { Kbd, KbdGroup, KbdShortcut, type KeyLabels }
