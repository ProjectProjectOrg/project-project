import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import {
  createContext,
  use,
  useRef,
  type ReactNode,
  type RefObject
} from "react"

import {
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@/hooks/useFluidHover"
import { cn } from "@/lib/utils"

export const NavHoverContext = createContext<
  UseFluidHoverReturn["registerItem"] | null
>(null)

export function useNavHoverItem(
  index: number,
  ref: RefObject<HTMLElement | null>
) {
  useRegisterFluidHoverItem(use(NavHoverContext) ?? undefined, index, ref)
}

export const navFocusRing =
  "outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-inset"

// Chrome composites background-color transitions and can paint their start colour for one frame as they end.
export const navActiveFill =
  "before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:bg-accent before:opacity-0 before:transition-opacity hover:before:duration-0"

export const navActiveState = "font-semibold text-foreground before:opacity-100"

const navRowClass =
  "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-body transition-colors"

type NavItemProps = (
  | {
      to: "/"
      params?: undefined
    }
  | {
      to: "/orgs/$orgSlug"
      params: { orgSlug: string }
    }
  | {
      to: "/orgs/$orgSlug/inbox"
      params: { orgSlug: string }
    }
) & {
  icon: LucideIcon
  label: string
  trailing?: ReactNode
  accessibleLabel?: string
  index: number
  exact?: boolean
}

export function NavItem({
  to,
  params,
  icon: Icon,
  label,
  index,
  exact,
  trailing,
  accessibleLabel
}: NavItemProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  useNavHoverItem(index, ref)
  const base = cn(navRowClass, navFocusRing, navActiveFill)
  return (
    <Link
      ref={ref}
      to={to}
      params={params}
      activeOptions={{ exact: exact ?? false, includeSearch: false }}
      className={base}
      inactiveProps={{
        className:
          "text-muted-foreground data-[fluid-hover-active]:text-foreground"
      }}
      activeProps={{
        className: navActiveState
      }}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span aria-hidden={accessibleLabel === undefined ? undefined : true}>
        {label}
      </span>
      {accessibleLabel !== undefined && (
        <span className="sr-only">{accessibleLabel}</span>
      )}
      {trailing !== undefined && (
        <span aria-hidden className="ml-auto">
          {trailing}
        </span>
      )}
    </Link>
  )
}
