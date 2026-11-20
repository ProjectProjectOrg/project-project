import type { useRender } from "@base-ui/react/use-render"
import { LayoutGroup, motion } from "motion/react"
import {
  createContext,
  use,
  useId,
  useLayoutEffect,
  useRef,
  type ComponentProps,
  type PointerEvent,
  type ReactNode
} from "react"

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

// The active item's bar: one element for the whole rail, moved with a CSS
// transition on `translate`. That runs on the compositor, so it keeps
// sliding while a project switch keeps the main thread busy rendering the
// new page (a JS-driven animation froze for 130–300ms there). It also
// starts on pointerdown, not click, which gives it a head start before that
// render begins.
const BAR_INSET = 7

function placeBar(
  nav: HTMLElement,
  bar: HTMLElement,
  item: Element | null,
  animate: boolean
) {
  if (!(item instanceof HTMLElement)) {
    bar.style.opacity = "0"
    return
  }
  const y =
    item.getBoundingClientRect().top -
    nav.getBoundingClientRect().top +
    BAR_INSET
  if (!animate) bar.style.transition = "none"
  bar.style.translate = `0 ${y}px`
  bar.style.opacity = "1"
  if (!animate) {
    // Apply the jump, then hand the transition back for the next move.
    void bar.offsetHeight
    bar.style.transition = ""
  }
}

const activeItem = (nav: HTMLElement) =>
  nav.querySelector('[data-slot="sidebar-rail-item"] > [data-active]')

function SidebarRail({
  label,
  top,
  bottom,
  children,
  className
}: SidebarRailProps) {
  const id = useId()
  const navRef = useRef<HTMLElement>(null)
  const barRef = useRef<HTMLSpanElement>(null)
  const placed = useRef(false)

  // After every render, the bar goes to the active item: a slide, or a jump
  // the first time (no slide in from the top on load).
  useLayoutEffect(() => {
    const nav = navRef.current
    const bar = barRef.current
    if (!nav || !bar) return
    placeBar(nav, bar, activeItem(nav), placed.current)
    placed.current = true
  })

  // A plain press on a link item moves the bar right away.
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    const nav = navRef.current
    const bar = barRef.current
    if (!nav || !bar || event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    if (!(event.target instanceof Element)) return
    const link = event.target.closest("a.pp-rail-item")
    if (link) placeBar(nav, bar, link, true)
  }
  // A press that didn't navigate (dragged off, cancelled) puts it back.
  const resync = () => {
    const nav = navRef.current
    const bar = barRef.current
    if (nav && bar) placeBar(nav, bar, activeItem(nav), true)
  }

  return (
    // pt-[19px] centres the top item (34px) on the panel header's title and
    // subtitle (36px from the top: the panel's 8px plus the header's 10px
    // padding), which is also where the page's breadcrumbs sit.
    <nav
      ref={navRef}
      aria-label={label}
      data-slot="sidebar-rail"
      onPointerDown={onPointerDown}
      onPointerCancel={resync}
      className={cn(
        "relative flex h-full w-14 shrink-0 flex-col bg-rail pt-[19px] pb-3",
        className
      )}
    >
      <span
        ref={barRef}
        aria-hidden
        data-slot="sidebar-rail-bar"
        className="pointer-events-none absolute top-0 left-0 z-10 h-5 w-[3px] rounded-r-[3px] bg-foreground opacity-0 transition-[translate,opacity] duration-220 ease-standard motion-reduce:transition-none"
      />
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
              // The bar follows the list as it scrolls, without sliding.
              onScroll={() => {
                const nav = navRef.current
                const bar = barRef.current
                if (nav && bar) placeBar(nav, bar, activeItem(nav), false)
              }}
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
    // `tile` holds a project's tile: always a squircle, like ProjectIcon,
    // whatever the button corner setting; its radius comes with the tile.
    shape?: "button" | "tile"
    render?: useRender.RenderProp
    children: ReactNode
  }>

function SidebarRailItem({
  label,
  tooltip,
  active = false,
  tone,
  shape = "button",
  render,
  className,
  style,
  children,
  ...props
}: SidebarRailItemProps) {
  const inRail = use(InRailContext)
  return (
    <div
      data-slot="sidebar-rail-item"
      className="relative flex w-full shrink-0 justify-center"
    >
      {active && !inRail ? (
        // Outside a rail (a lone item), the bar is the item's own.
        <span
          aria-hidden
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
          "pp-rail-item focus-ring grid size-[34px] shrink-0 cursor-pointer place-items-center rounded-[17px] text-subtitle [&>svg:not([class*='size-'])]:size-[18px]",
          shape === "tile"
            ? "corner-squircle"
            : "[corner-shape:var(--button-corner)]",
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
