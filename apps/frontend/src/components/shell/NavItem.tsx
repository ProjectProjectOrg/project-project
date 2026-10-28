import { Link } from "@tanstack/react-router"
import { cva, type VariantProps } from "class-variance-authority"
import type { LucideIcon } from "lucide-react"
import {
  createContext,
  use,
  useRef,
  type ComponentProps,
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

const navRowClass =
  "relative z-10 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition-colors"

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
  const base = cn(navRowClass, navFocusRing, className)
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

const navButtonVariants = cva([navRowClass, navFocusRing, "w-full"], {
  variants: {
    variant: {
      ghost:
        "text-muted-foreground hover:bg-hover hover:text-foreground data-[popup-open]:bg-accent data-[popup-open]:text-foreground",
      tinted:
        "bg-tint text-foreground hover:bg-tint-hover data-[popup-open]:bg-accent"
    }
  },
  defaultVariants: { variant: "ghost" }
})

export function NavButton({
  icon: Icon,
  label,
  variant,
  className,
  ...props
}: Omit<ComponentProps<"button">, "children"> &
  VariantProps<typeof navButtonVariants> &
  Readonly<{
    icon: LucideIcon
    label: string
  }>) {
  return (
    <button
      type="button"
      className={cn(navButtonVariants({ variant }), className)}
      {...props}
    >
      <Icon className="size-4" strokeWidth={1.75} />
      <span>{label}</span>
    </button>
  )
}
