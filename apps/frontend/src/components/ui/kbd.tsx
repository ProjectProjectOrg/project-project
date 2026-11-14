import {
  detectPlatform,
  formatForDisplay,
  parseHotkey,
  type Hotkey,
  type HotkeyPlatform
} from "@tanstack/react-hotkeys"
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
import * as React from "react"

import type { IconComponent } from "@/lib/icon"
import { installKeyCapHighlight } from "@/lib/keyCapHighlight"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const KBD_SIZES = {
  default: "h-5 min-w-5 text-micro",
  sm: "h-4 min-w-4 text-micro-compact leading-none"
} as const

const KBD_VARIANTS = {
  default: "rounded-sm bg-muted",
  menu: "rounded-[5px] bg-hover"
} as const

function Kbd({
  className,
  size = "default",
  variant = "default",
  ...props
}: React.ComponentProps<"kbd"> & {
  size?: keyof typeof KBD_SIZES
  variant?: keyof typeof KBD_VARIANTS
}) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex w-fit items-center justify-center gap-1 px-1 font-sans text-muted-foreground transition-colors duration-150 select-none",
        KBD_SIZES[size],
        KBD_VARIANTS[variant],
        "[&_svg:not([class*='size-'])]:size-[1em]",
        "[[data-slot=tooltip-content]_&]:bg-background/20 [[data-slot=tooltip-content]_&]:text-background dark:[[data-slot=tooltip-content]_&]:bg-background/10",
        "data-pressed:bg-foreground data-pressed:text-background data-pressed:duration-0",
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
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

const WORD_LABELS: ReadonlyMap<string, () => string> = new Map([
  ["Control", m.common_key_ctrl],
  ["Alt", m.common_key_alt],
  ["Shift", m.common_key_shift],
  ["Meta", m.common_key_win],
  ["Enter", m.common_key_enter],
  ["Tab", m.common_key_tab],
  ["Backspace", m.common_key_backspace],
  ["Delete", m.common_key_delete],
  ["Escape", m.common_key_escape],
  ["Space", m.common_key_space]
])

const MAC_WORDS: ReadonlySet<string> = new Set(["Escape", "Space"])

export type KeyCap = Readonly<{ key: string; label: string }>

export function hotkeyCaps(
  hotkey: Hotkey,
  platform: HotkeyPlatform
): ReadonlyArray<KeyCap> {
  return [hotkey].flat().flatMap((chord) => {
    const parsed = parseHotkey(chord, platform)
    const labels = formatForDisplay(chord, { platform, parts: true })
    const names =
      parsed.key === undefined
        ? parsed.modifiers
        : [...parsed.modifiers, parsed.key]
    return names.map((name, index) => {
      const word =
        platform !== "mac" || MAC_WORDS.has(name)
          ? WORD_LABELS.get(name)
          : undefined
      return {
        key: name.toLowerCase(),
        label: word?.() ?? labels[index] ?? name
      }
    })
  })
}

const platform = detectPlatform()

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

function CapLabel({ label }: Readonly<{ label: string }>) {
  if (!isGlyph(label)) return label
  const Icon = GLYPH_ICONS[label]
  return (
    <>
      <Icon aria-hidden className="size-[1em]" strokeWidth={2} />
      <span className="sr-only">{label}</span>
    </>
  )
}

function KbdShortcut({
  keys,
  size,
  variant,
  className,
  ...props
}: Omit<React.ComponentProps<"kbd">, "children"> &
  Readonly<{
    keys: Hotkey
    size?: keyof typeof KBD_SIZES
    variant?: keyof typeof KBD_VARIANTS
  }>) {
  React.useEffect(installKeyCapHighlight, [])
  const caps = hotkeyCaps(keys, platform)
  return (
    <KbdGroup className={cn("gap-0.5", className)} {...props}>
      {caps.map((cap, i) => (
        <Kbd
          key={`${cap.label}-${i}`}
          size={size}
          variant={variant}
          data-key={cap.key}
        >
          <CapLabel label={cap.label} />
        </Kbd>
      ))}
    </KbdGroup>
  )
}

export { Kbd, KbdGroup, KbdShortcut }
