import {
  useHighlightedItem,
  type CommandMenuItemData
} from "@pp/ui/command-menu"
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from "@pp/ui/empty"
import { EyeOff } from "@pp/ui/icons"
import { useDebouncedValue } from "@tanstack/react-pacer"
import {
  animate,
  useMotionValue,
  useReducedMotion,
  useTransform
} from "motion/react"
import { useLayoutEffect, useState, type ReactNode } from "react"

import { m } from "@/paraglide/messages"

const PEEK_SETTLE_MS = 60
const PEEK_MIN_VIEWPORT = 720
const WIPE = { type: "spring", visualDuration: 0.16, bounce: 0 } as const
const OPEN_WIDTH = 42
const CLOSED_WIDTH = 100

export const peekFits = () => window.innerWidth >= PEEK_MIN_VIEWPORT

export function usePeekWipe() {
  const reduceMotion = useReducedMotion() ?? false
  const width = useMotionValue(CLOSED_WIDTH)
  const listWidth = useTransform(width, (value) => `${value}%`)
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const toggle = (next: boolean) => {
    if (next === open) return
    setOpen(next)
    if (next) setMounted(true)
    const target = next ? OPEN_WIDTH : CLOSED_WIDTH
    if (reduceMotion) {
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
  render
}: Readonly<{ render: (value: string) => ReactNode }>) {
  return (
    <aside className="absolute inset-y-0 right-0 w-[58%] overflow-hidden">
      <PeekContent render={render} />
    </aside>
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
      <Empty intensity="subtle" animated={false} className="h-full min-h-0">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <EyeOff strokeWidth={1.75} />
          </EmptyMedia>
          <EmptyTitle>{m.chrome_command_menu_no_preview()}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    )
  )
}
