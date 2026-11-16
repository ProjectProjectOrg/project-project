import type { useRender } from "@base-ui/react/use-render"
import { LayoutGroup, motion, useReducedMotion } from "motion/react"
import {
  createContext,
  use,
  useId,
  type ComponentProps,
  type ReactNode
} from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { TooltipGroup, TooltipGroupTrigger } from "./tooltip"

type SidebarRailProps = Readonly<{
  label: string
  top?: ReactNode
  bottom?: ReactNode
  children: ReactNode
  className?: string
}>

const InRailContext = createContext(false)

function SidebarRail({
  label,
  top,
  bottom,
  children,
  className
}: SidebarRailProps) {
  const id = useId()
  return (
    // pt-[19px] centres the top item (34px) on the panel header's title and
    // subtitle (36px from the top: the panel's 8px plus the header's 10px
    // padding), which is also where the page's breadcrumbs sit.
    <nav
      aria-label={label}
      data-slot="sidebar-rail"
      className={cn(
        "flex h-full w-14 shrink-0 flex-col bg-rail pt-[19px] pb-3",
        className
      )}
    >
      <InRailContext value>
        <LayoutGroup id={id}>
          <TooltipGroup side="right" sideOffset={10}>
            {top == null ? null : (
              <div className="flex shrink-0 flex-col items-center gap-1.5 pb-2.5">
                {top}
              </div>
            )}
            <motion.div
              layoutScroll
              className="flex min-h-0 flex-1 [scrollbar-width:none] flex-col gap-1.5 overflow-y-auto py-1"
            >
              {children}
            </motion.div>
            {bottom == null ? null : (
              <div className="flex shrink-0 flex-col gap-1.5 pt-2">
                {bottom}
              </div>
            )}
          </TooltipGroup>
        </LayoutGroup>
      </InRailContext>
    </nav>
  )
}

type SidebarRailItemProps = Omit<ComponentProps<"button">, "children"> &
  Readonly<{
    label: string
    tooltip?: ReactNode
    active?: boolean
    tone?: string
    render?: useRender.RenderProp
    children: ReactNode
  }>

function SidebarRailItem({
  label,
  tooltip,
  active = false,
  tone,
  render,
  className,
  style,
  children,
  ...props
}: SidebarRailItemProps) {
  const reduceMotion = useReducedMotion() ?? false
  const inRail = use(InRailContext)
  return (
    <div
      data-slot="sidebar-rail-item"
      className="relative flex w-full shrink-0 justify-center"
    >
      {active ? (
        <motion.span
          layoutId={inRail ? "sidebar-rail-bar" : undefined}
          aria-hidden
          transition={reduceMotion ? { duration: 0 } : transitions.layout}
          className="pointer-events-none absolute inset-y-[7px] left-0 w-[3px] rounded-r-[3px] bg-foreground"
        />
      ) : null}
      <TooltipGroupTrigger
        tooltip={tooltip ?? label}
        render={render}
        type={render === undefined ? "button" : undefined}
        aria-label={label}
        aria-current={active ? "page" : undefined}
        data-active={active || undefined}
        data-tone={tone === undefined ? undefined : ""}
        style={tone === undefined ? style : { ...style, "--rail-tone": tone }}
        className={cn(
          "pp-rail-item focus-ring grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-[17px] text-subtitle [corner-shape:var(--button-corner)] [&>svg:not([class*='size-'])]:size-[18px]",
          className
        )}
        {...props}
      >
        {children}
      </TooltipGroupTrigger>
    </div>
  )
}

function SidebarRailSeparator({ className }: Readonly<{ className?: string }>) {
  return (
    <hr
      className={cn(
        "mx-auto my-1 h-px w-5 shrink-0 border-0 bg-[var(--segment-line)]",
        className
      )}
    />
  )
}

export { SidebarRail, SidebarRailItem, SidebarRailSeparator }
export type { SidebarRailProps, SidebarRailItemProps }
