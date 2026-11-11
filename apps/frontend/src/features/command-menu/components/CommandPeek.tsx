import { useDebouncedValue } from "@tanstack/react-pacer"
import { EyeOff } from "lucide-react"
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform
} from "motion/react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import {
  useHighlightedItem,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import { m } from "@/paraglide/messages"

const PEEK_SETTLE_MS = 60
const PEEK_MIN_VIEWPORT = 720
const WIPE = { type: "spring", visualDuration: 0.16, bounce: 0 } as const
const SNAP_WITHIN_MS = 120
const OPEN_WIDTH = 42
const CLOSED_WIDTH = 100
const FADE_IN = { duration: 0.18, ease: [0.4, 0, 1, 1] } as const
const FADE_OUT = { duration: 0.06, ease: "linear" } as const

export const peekFits = () => window.innerWidth >= PEEK_MIN_VIEWPORT

export function usePeekWipe() {
  const reduceMotion = useReducedMotion() ?? false
  const width = useMotionValue(CLOSED_WIDTH)
  const listWidth = useTransform(width, (value) => `${value}%`)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const lastToggle = useRef(0)

  const toggle = (next: boolean) => {
    if (next === open) return
    const now = performance.now()
    const snap = reduceMotion || now - lastToggle.current < SNAP_WITHIN_MS
    lastToggle.current = now
    setOpen(next)
    if (next) setMounted(true)
    const target = next ? OPEN_WIDTH : CLOSED_WIDTH
    if (snap) {
      width.jump(target)
      if (!next) setMounted(false)
      return
    }
    void animate(width, target, WIPE).then(() => {
      if (width.get() === CLOSED_WIDTH) setMounted(false)
    })
  }

  return {
    mounted,
    active: open,
    style: { width: listWidth },
    open: () => toggle(true),
    close: () => toggle(false)
  }
}

export function TrackHighlight({
  onChange
}: Readonly<{ onChange: (row: CommandMenuItemData | undefined) => void }>) {
  const row = useHighlightedItem()
  useLayoutEffect(() => onChange(row))
  return null
}

const WARM_DELAY_MS = 150

export function PeekWarmer({
  warm
}: Readonly<{ warm: (value: string) => ReactNode }>) {
  const row = useHighlightedItem()
  const [value] = useDebouncedValue(row?.value ?? null, {
    wait: WARM_DELAY_MS
  })
  return value === null ? null : warm(value)
}

export function CommandPeekPane({
  open,
  render
}: Readonly<{ open: boolean; render: (value: string) => ReactNode }>) {
  return (
    <motion.aside
      initial={{ opacity: 0 }}
      animate={{ opacity: open ? 1 : 0 }}
      transition={open ? FADE_IN : FADE_OUT}
      className="absolute inset-y-0 right-0 w-[58%] overflow-hidden"
    >
      <PeekContent render={render} />
    </motion.aside>
  )
}

function PeekContent({
  render
}: Readonly<{ render: (value: string) => ReactNode }>) {
  const row = useHighlightedItem()
  const [value] = useDebouncedValue(row?.value ?? null, {
    wait: PEEK_SETTLE_MS,
    leading: true,
    trailing: true
  })
  const preview = value === null ? null : render(value)
  return (
    preview ?? (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-body text-muted-foreground">
        <EyeOff className="size-5" strokeWidth={1.5} />
        {m.chrome_command_menu_no_preview()}
      </div>
    )
  )
}
