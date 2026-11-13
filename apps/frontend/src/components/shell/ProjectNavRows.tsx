import { Link, type LinkComponentProps } from "@tanstack/react-router"
import { ChevronRight } from "lucide-react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { useRef, type ReactNode } from "react"

import { navFocusRing, useNavHoverItem } from "@/components/shell/NavItem"
import { transitions } from "@/lib/springs"
import { cn } from "@/lib/utils"

export function SectionHeader({
  label,
  action
}: {
  label: string
  action?: ReactNode
}) {
  return (
    <div
      data-nav-skip
      className="flex h-9 items-end justify-between px-3 pb-1.5 text-caption font-semibold text-muted-foreground"
    >
      <span>{label}</span>
      {action ? <span className="-mr-2 -mb-1">{action}</span> : null}
    </div>
  )
}

export function Reveal({
  open,
  children
}: {
  open: boolean
  children: ReactNode
}) {
  const reduceMotion = useReducedMotion()
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.div
          initial={reduceMotion ? false : { height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={reduceMotion ? undefined : { height: 0, opacity: 0 }}
          transition={transitions.layout}
          className="overflow-hidden"
        >
          {children}
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}

const rowClass =
  "relative z-10 mb-1 flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-colors"

function rowState(active: boolean) {
  return active
    ? "bg-accent font-semibold text-foreground"
    : "text-muted-foreground data-[fluid-hover-active]:text-foreground"
}

export function NavRow({
  index,
  icon,
  label,
  meta,
  active,
  expanded,
  ...linkProps
}: Omit<LinkComponentProps, "children"> &
  Readonly<{
    index: number
    icon?: ReactNode
    label: string
    meta?: string
    active: boolean
    expanded?: boolean
  }>) {
  const ref = useRef<HTMLAnchorElement>(null)
  useNavHoverItem(index, ref)
  return (
    <Link
      ref={ref}
      {...linkProps}
      activeOptions={{ exact: true }}
      aria-current={active ? "page" : undefined}
      aria-expanded={expanded}
      className={cn(rowClass, navFocusRing, rowState(active))}
    >
      {icon ? (
        <span className="flex size-4 shrink-0 items-center justify-center">
          {icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? (
        <span className="shrink-0 text-caption font-normal text-muted-foreground tabular-nums">
          {meta}
        </span>
      ) : null}
      {expanded !== undefined ? (
        <ChevronRight
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90"
          )}
          strokeWidth={1.75}
        />
      ) : null}
    </Link>
  )
}

export function ToggleRow({
  index,
  open,
  onToggle,
  label,
  meta
}: {
  index: number
  open: boolean
  onToggle: () => void
  label: string
  meta?: string
}) {
  const ref = useRef<HTMLButtonElement>(null)
  useNavHoverItem(index, ref)
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className={cn(
        rowClass,
        navFocusRing,
        rowState(false),
        "w-full text-left"
      )}
    >
      <ChevronRight
        className={cn(
          "size-4 shrink-0 transition-transform duration-200",
          open && "rotate-90"
        )}
        strokeWidth={1.75}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {meta ? (
        <span className="shrink-0 text-caption font-normal tabular-nums">
          {meta}
        </span>
      ) : null}
    </button>
  )
}
