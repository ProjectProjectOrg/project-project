import { Link } from "@tanstack/react-router"
import type { LucideIcon } from "lucide-react"
import { createContext, use, useRef, type RefObject } from "react"

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

type NavItemProps = (
  | {
      to: "/"
      params?: undefined
    }
  | {
      to: "/orgs/$orgSlug/projects"
      params: { orgSlug: string }
    }
  | {
      to: "/orgs/$orgSlug"
      params: { orgSlug: string }
    }
) & {
  icon: LucideIcon
  label: string
  index: number
  exact?: boolean
  fillWhenActive?: boolean
  className?: string
}

export function NavItem({
  to,
  params,
  icon: Icon,
  label,
  index,
  exact,
  fillWhenActive = true,
  className
}: NavItemProps) {
  const ref = useRef<HTMLAnchorElement>(null)
  useNavHoverItem(index, ref)
  const base = cn(
    "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors",
    navFocusRing,
    className
  )
  return (
    <Link
      ref={ref}
      to={to}
      params={params}
      activeOptions={{ exact: exact ?? false }}
      className={base}
      inactiveProps={{
        className:
          "text-muted-foreground data-[fluid-hover-active]:text-foreground"
      }}
      activeProps={{
        className: cn(
          "font-medium text-foreground",
          fillWhenActive && "bg-accent"
        )
      }}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span>{label}</span>
    </Link>
  )
}
