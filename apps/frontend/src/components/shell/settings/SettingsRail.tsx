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
  useRef,
  type ReactNode,
  type RefObject
} from "react"

import { navActiveFill, navActiveState } from "@/components/shell/NavItem"
import { FluidHoverHighlight } from "@/components/ui/fluid-hover-highlight"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"

const SettingsRailNavContext = createContext<
  UseFluidHoverReturn["registerItem"] | null
>(null)

export function SettingsRailNav({
  children
}: Readonly<{ children: ReactNode }>) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)

  return (
    <SettingsRailNavContext value={hover.registerItem}>
      <nav>
        <div
          ref={listRef}
          role="presentation"
          onMouseEnter={hover.handlers.onMouseEnter}
          onMouseMove={hover.handlers.onMouseMove}
          onMouseLeave={hover.handlers.onMouseLeave}
          onClick={hover.handlers.onClick}
          className="relative flex flex-col gap-5"
        >
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
    use(SettingsRailNavContext) ?? undefined,
    index,
    ref
  )
}

type SettingsRailLinkProps = Omit<
  LinkComponentProps,
  "children" | "className"
> &
  Readonly<{ icon: LucideIcon; label: string; index: number }>

export function SettingsRailLink({
  icon: Icon,
  label,
  index,
  ...linkProps
}: SettingsRailLinkProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  const registerItem = use(SettingsRailNavContext)
  const matchRoute = useMatchRoute()
  const active = useLocation({
    select: () =>
      Boolean(
        matchRoute({ to: linkProps.to, params: linkProps.params, fuzzy: true })
      )
  })
  useRegisterFluidHoverItem(registerItem ?? undefined, index, ref)

  return (
    <Link
      {...linkProps}
      ref={ref}
      className={cn(
        "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-colors duration-100 before:duration-100",
        navActiveFill,
        active
          ? navActiveState
          : "text-muted-foreground hover:text-foreground data-[fluid-hover-active]:text-foreground"
      )}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Link>
  )
}
