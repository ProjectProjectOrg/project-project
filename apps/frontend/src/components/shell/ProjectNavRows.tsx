import { cn } from "@pp/ui/lib/utils"
import { Link, type LinkComponentProps } from "@tanstack/react-router"
import { useRef, type ReactNode } from "react"

import {
  navActiveFill,
  navActiveState,
  navFocusRing,
  useNavHoverItem
} from "@/components/shell/NavItem"

const rowClass =
  "relative z-10 mb-1 flex min-w-0 items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-colors"

function rowState(active: boolean) {
  return active
    ? navActiveState
    : "text-muted-foreground data-[fluid-hover-active]:text-foreground"
}

export function NavRow({
  index,
  icon,
  label,
  meta,
  active,
  ...linkProps
}: Omit<LinkComponentProps, "children"> &
  Readonly<{
    index: number
    icon?: ReactNode
    label: string
    meta?: string
    active: boolean
  }>) {
  const ref = useRef<HTMLAnchorElement>(null)
  useNavHoverItem(index, ref)
  return (
    <Link
      ref={ref}
      {...linkProps}
      activeOptions={{ exact: true }}
      aria-current={active ? "page" : undefined}
      className={cn(rowClass, navFocusRing, navActiveFill, rowState(active))}
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
    </Link>
  )
}

export function NavSubRows({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <div className="relative ml-5 flex flex-col pl-2 before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-border">
      {children}
    </div>
  )
}
