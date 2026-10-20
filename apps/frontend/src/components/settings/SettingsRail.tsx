import {
  Link,
  useLocation,
  useMatchRoute,
  type LinkComponentProps
} from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import { motion, useReducedMotion } from "motion/react"
import {
  createContext,
  use,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react"

import { FluidHoverHighlight } from "@/components/fluid-hover-highlight"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/use-fluid-hover"
import { spring } from "@/lib/springs"
import { cn } from "@/lib/utils"

export function SettingsRail({ children }: Readonly<{ children: ReactNode }>) {
  return <div className="flex h-full flex-col gap-4">{children}</div>
}

type SettingsRailNavValue = Readonly<{
  registerItem: UseFluidHoverReturn["registerItem"]
  setActiveIndex: (index: number) => void
}>

const SettingsRailNavContext = createContext<SettingsRailNavValue | null>(null)

export function SettingsRailNav({
  children
}: Readonly<{ children: ReactNode }>) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const reduceMotion = useReducedMotion() ?? false
  const navValue = useMemo(
    () => ({ registerItem: hover.registerItem, setActiveIndex }),
    [hover.registerItem]
  )

  const activeRect =
    hover.isMeasured && activeIndex !== null
      ? hover.itemRects[activeIndex]
      : undefined

  return (
    <SettingsRailNavContext value={navValue}>
      <nav>
        <div
          ref={listRef}
          role="presentation"
          onMouseEnter={hover.handlers.onMouseEnter}
          onMouseMove={hover.handlers.onMouseMove}
          onMouseLeave={hover.handlers.onMouseLeave}
          onClick={hover.handlers.onClick}
          className="relative flex flex-col gap-1"
        >
          {activeRect ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 rounded-lg bg-accent"
              initial={false}
              animate={{
                x: activeRect.left,
                y: activeRect.top,
                width: activeRect.width,
                height: activeRect.height
              }}
              transition={reduceMotion ? { duration: 0 } : spring.moderate}
            />
          ) : null}
          <FluidHoverHighlight hover={hover} className="rounded-lg" />
          {children}
        </div>
      </nav>
    </SettingsRailNavContext>
  )
}

type SettingsRailLinkProps = Omit<LinkComponentProps, "children"> &
  Readonly<{ icon: LucideIcon; label: string; index: number }>

export function SettingsRailLink({
  icon: Icon,
  label,
  index,
  className,
  ...linkProps
}: SettingsRailLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  const nav = use(SettingsRailNavContext)
  const matchRoute = useMatchRoute()
  const active = useLocation({
    select: () =>
      Boolean(
        matchRoute({ to: linkProps.to, params: linkProps.params, fuzzy: true })
      )
  })
  useRegisterFluidHoverItem(nav?.registerItem, index, ref)

  const setActiveIndex = nav?.setActiveIndex
  useLayoutEffect(() => {
    if (active) setActiveIndex?.(index)
  }, [active, index, setActiveIndex])

  return (
    <Link
      {...linkProps}
      ref={ref}
      className={cn(
        "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-[color,transform] duration-100 active:scale-[0.97]",
        active
          ? "font-medium text-foreground"
          : "text-muted-foreground hover:text-foreground data-[fluid-hover-active]:text-foreground",
        className
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}
