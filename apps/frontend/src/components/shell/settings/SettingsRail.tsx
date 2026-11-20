import { FluidHoverHighlight } from "@pp/ui/fluid-hover-highlight"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@pp/ui/hooks/useFluidHover"
import type { IconType } from "@pp/ui/icons"
import { cn } from "@pp/ui/lib/utils"
import {
  Link,
  useLocation,
  useMatchRoute,
  type LinkComponentProps
} from "@tanstack/react-router"
import { createContext, use, useRef, type ReactNode } from "react"

// Chrome composites background-color transitions and can paint their start colour for one frame as they end.
const navActiveFill =
  "before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-accent before:opacity-0 before:transition-opacity hover:before:duration-0"

const navActiveState = "font-semibold text-foreground before:opacity-100"

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
          <FluidHoverHighlight hover={hover} />
          {children}
        </div>
      </nav>
    </SettingsRailNavContext>
  )
}

type SettingsRailLinkProps = Omit<
  LinkComponentProps,
  "children" | "className"
> &
  Readonly<{ icon: IconType; label: string; index: number }>

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
        "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-[color,transform] duration-100 before:duration-100 active:scale-97",
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
