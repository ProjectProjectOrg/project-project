import {
  Link,
  useLocation,
  useMatchRoute,
  type LinkComponentProps
} from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  createContext,
  use,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject
} from "react"

import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"

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
            <div
              aria-hidden
              className="pointer-events-none absolute top-0 left-0 rounded-lg bg-accent"
              style={{
                transform: `translate(${activeRect.left}px, ${activeRect.top}px)`,
                width: activeRect.width,
                height: activeRect.height
              }}
            />
          ) : null}
          <FluidHoverHighlight hover={hover} className="rounded-lg" />
          {children}
        </div>
      </nav>
    </SettingsRailNavContext>
  )
}

export function useSettingsRailItem(
  index: number,
  ref: RefObject<HTMLElement | null>
) {
  useRegisterFluidHoverItem(
    use(SettingsRailNavContext)?.registerItem,
    index,
    ref
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
        "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-[color,transform] duration-100 active:scale-[0.97]",
        active
          ? "font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground data-[fluid-hover-active]:text-foreground",
        className
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}
