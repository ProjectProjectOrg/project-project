import { useRender } from "@base-ui/react/use-render"
import {
  createContext,
  use,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode
} from "react"

import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "../hooks/useFluidHover"
import { cn } from "../lib/utils"
import { FluidHoverHighlight } from "./fluid-hover-highlight"
import { ChevronRight } from "./icons"
import {
  SidebarBack,
  SidebarPanel,
  type SidebarBackProps,
  type SidebarPanelProps,
  type SidebarPanelTransition
} from "./sidebar-panel"
import {
  SidebarRail,
  SidebarRailItem,
  SidebarRailSeparator,
  type SidebarRailItemProps,
  type SidebarRailProps
} from "./sidebar-rail"
import { SidebarRowGroup, type SidebarRowGroupProps } from "./sidebar-row-group"
import { TextSwap } from "./text-swap"
import { Tooltip, TooltipContent, TooltipTrigger } from "./tooltip"

type SidebarPanelHeaderProps = Readonly<{
  title: string
  subtitle?: string
  // An icon before the subtitle (the sprint's state).
  subtitleIcon?: ReactNode
  trailing?: ReactNode
  className?: string
}>

// Plain text that truncates: the header swaps at once with the project, the
// breadcrumbs carry the animated change.
function SidebarPanelHeader({
  title,
  subtitle,
  subtitleIcon,
  trailing,
  className
}: SidebarPanelHeaderProps) {
  return (
    <div
      data-slot="sidebar-panel-header"
      className={cn(
        "mx-2 mb-1 flex shrink-0 items-center gap-2 px-2.5 py-2.5",
        className
      )}
    >
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="truncate text-subtitle font-semibold text-foreground">
          {title}
        </div>
        {subtitle === undefined ? null : (
          <div className="flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground">
            {subtitleIcon}
            <span className="truncate">{subtitle}</span>
          </div>
        )}
      </div>
      {trailing}
    </div>
  )
}

type RowRegistry = Readonly<{
  registerItem: UseFluidHoverReturn["registerItem"]
  nextIndex: () => number
}>

const RowRegistryContext = createContext<RowRegistry | null>(null)

type SidebarPanelBodyProps = Readonly<{
  label?: string
  children: ReactNode
  className?: string
}>

function SidebarPanelBody({
  label,
  children,
  className
}: SidebarPanelBodyProps) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  const counter = useRef(0)
  const registry = useMemo<RowRegistry>(
    () => ({
      registerItem: hover.registerItem,
      nextIndex: () => {
        counter.current += 1
        return counter.current
      }
    }),
    [hover.registerItem]
  )
  const Root = label === undefined ? "div" : "nav"
  return (
    <Root
      aria-label={label}
      data-slot="sidebar-panel-body"
      className={cn("min-h-0 flex-1 overflow-y-auto px-2 py-1", className)}
    >
      {/* oxlint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions -- the gliding highlight's pointer handlers; keyboard users reach the rows themselves */}
      <div
        ref={listRef}
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={hover.handlers.onMouseMove}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative flex flex-col"
      >
        <FluidHoverHighlight
          hover={hover}
          className="z-[1] rounded-[16px] [corner-shape:var(--button-corner)]"
        />
        <RowRegistryContext value={registry}>{children}</RowRegistryContext>
      </div>
    </Root>
  )
}

type SidebarSectionProps = Readonly<{
  label: string
  icon?: ReactNode
  count?: number
  children?: ReactNode
  className?: string
}>

function SidebarSection({
  label,
  icon,
  count,
  children,
  className
}: SidebarSectionProps) {
  return (
    <div data-slot="sidebar-section" className={cn("flex flex-col", className)}>
      <div className="flex items-center gap-1.5 px-2.5 pt-3.5 pb-1 text-caption font-semibold text-muted-foreground">
        {icon}
        {label}
        {count === undefined || count === 0 ? null : (
          <span className="ml-auto font-normal tabular-nums">
            <TextSwap speed="fast">{String(count)}</TextSwap>
          </span>
        )}
      </div>
      {children}
    </div>
  )
}

function SidebarNote({
  children,
  className
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <p
      className={cn(
        "mx-2.5 mt-0.5 text-caption text-muted-foreground",
        className
      )}
    >
      {children}
    </p>
  )
}

type SidebarRowProps = Omit<ComponentProps<"button">, "children"> &
  Readonly<{
    label: string
    icon?: ReactNode
    meta?: ReactNode
    active?: boolean
    live?: boolean
    highlight?: boolean
    action?: ReactNode
    // The row opens a sub-page in the panel (settings): a trailing chevron.
    submenu?: boolean
    render?: useRender.RenderProp
  }>

function SidebarRow({
  label,
  icon,
  meta,
  active = false,
  live = false,
  highlight = false,
  action,
  submenu = false,
  render,
  className,
  ...props
}: SidebarRowProps) {
  const registry = use(RowRegistryContext)
  const [index] = useState(() => registry?.nextIndex())
  const wrapperRef = useRef<HTMLDivElement>(null)
  useRegisterFluidHoverItem(registry?.registerItem, index, wrapperRef)
  const hasAction = action != null
  const main = useRender({
    defaultTagName: "button",
    render,
    props: {
      type: render === undefined ? ("button" as const) : undefined,
      ...props,
      "aria-current": active ? ("page" as const) : undefined,
      "data-active": active || undefined,
      "data-live": live || undefined,
      "data-highlight": highlight || undefined,
      "data-fluid": registry === null ? undefined : "",
      className: cn(
        "pp-sidebar-row focus-ring flex h-8 w-full min-w-0 cursor-pointer items-center gap-2.5 rounded-[16px] px-2.5 text-left text-body select-none [corner-shape:var(--button-corner)]",
        className
      ),
      children: (
        <>
          {icon == null ? null : (
            <span className="flex size-4 shrink-0 items-center justify-center [&_svg:not([class*='size-'])]:size-4">
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {meta == null && !hasAction && !submenu ? null : (
            <span
              data-slot="sidebar-row-meta"
              className={cn(
                "pp-sidebar-row-meta flex shrink-0 justify-end text-caption font-normal text-muted-foreground tabular-nums",
                hasAction && "min-w-6"
              )}
            >
              {meta}
              {submenu ? (
                <ChevronRight
                  aria-hidden
                  strokeWidth={1.75}
                  className="pp-sidebar-row-submenu size-3.5 text-muted-foreground"
                />
              ) : null}
            </span>
          )}
        </>
      )
    }
  })
  return (
    <div
      ref={wrapperRef}
      data-slot="sidebar-row"
      data-live={live || undefined}
      data-action={hasAction || undefined}
      className="relative z-10 mb-px"
    >
      {main}
      {hasAction ? (
        <span className="absolute top-1 right-[5px] flex">{action}</span>
      ) : null}
    </div>
  )
}

type SidebarRowActionProps = Omit<ComponentProps<"button">, "children"> &
  Readonly<{
    label: string
    children: ReactNode
  }>

function SidebarRowAction({
  label,
  className,
  children,
  ...props
}: SidebarRowActionProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className={cn(
          "pp-sidebar-row-action focus-ring grid size-6 cursor-pointer place-items-center rounded-[12px] [corner-shape:var(--button-corner)] [&_svg:not([class*='size-'])]:size-3.5",
          className
        )}
        {...props}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  )
}

function SidebarSubRows({
  children,
  className
}: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <div
      data-slot="sidebar-sub-rows"
      className={cn(
        "relative ml-[18px] flex flex-col pl-2 before:absolute before:inset-y-1.5 before:left-0 before:w-0.5 before:-translate-x-1/2 before:rounded-full before:bg-border",
        className
      )}
    >
      {children}
    </div>
  )
}

export {
  SidebarBack,
  SidebarRowGroup,
  SidebarRail,
  SidebarRailItem,
  SidebarRailSeparator,
  SidebarPanel,
  SidebarPanelHeader,
  SidebarPanelBody,
  SidebarSection,
  SidebarNote,
  SidebarRow,
  SidebarRowAction,
  SidebarSubRows
}
export type {
  SidebarBackProps,
  SidebarPanelTransition,
  SidebarRowGroupProps,
  SidebarRailProps,
  SidebarRailItemProps,
  SidebarPanelProps,
  SidebarPanelHeaderProps,
  SidebarPanelBodyProps,
  SidebarSectionProps,
  SidebarRowProps,
  SidebarRowActionProps
}
