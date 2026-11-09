import { useDebouncedValue } from "@tanstack/react-pacer"
import { EyeOff } from "lucide-react"
import { useReducedMotion } from "motion/react"
import {
  useLayoutEffect,
  useState,
  type CSSProperties,
  type ReactNode,
  type TransitionEvent
} from "react"

import {
  useHighlightedItem,
  type CommandMenuItemData
} from "@/components/ui/command-menu"
import { cn } from "@/lib/utils"
import { m } from "@/paraglide/messages"

const PEEK_SETTLE_MS = 60
const PEEK_MIN_VIEWPORT = 720
const WIPE = "width 140ms cubic-bezier(0.22, 1, 0.36, 1)"

export const peekFits = () => window.innerWidth >= PEEK_MIN_VIEWPORT

type PeekPhase = "closed" | "open" | "closing"

export function usePeekWipe() {
  const reduceMotion = useReducedMotion() ?? false
  const [phase, setPhase] = useState<PeekPhase>("closed")
  return {
    mounted: phase !== "closed",
    active: phase === "open",
    style: {
      width: phase === "open" ? "42%" : "100%",
      transition: reduceMotion ? undefined : WIPE
    } satisfies CSSProperties,
    open: () => {
      if (phase !== "open") setPhase("open")
    },
    close: () => {
      if (phase === "open") setPhase(reduceMotion ? "closed" : "closing")
    },
    onTransitionEnd: (event: TransitionEvent<HTMLDivElement>) => {
      if (event.target === event.currentTarget && phase === "closing") {
        setPhase("closed")
      }
    }
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
  render,
  className
}: Readonly<{ render: (value: string) => ReactNode; className?: string }>) {
  return (
    <aside
      className={cn(
        "absolute inset-y-0 right-0 w-[58%] overflow-hidden border-l border-border/60",
        className
      )}
    >
      <PeekContent render={render} />
    </aside>
  )
}

function PeekContent({
  render
}: Readonly<{ render: (value: string) => ReactNode }>) {
  const row = useHighlightedItem()
  const [value] = useDebouncedValue(row?.value ?? null, {
    wait: PEEK_SETTLE_MS
  })
  const preview = value === null ? null : render(value)
  return (
    preview ?? (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[13px] text-muted-foreground">
        <EyeOff className="size-5" strokeWidth={1.5} />
        {m.chrome_command_menu_no_preview()}
      </div>
    )
  )
}
