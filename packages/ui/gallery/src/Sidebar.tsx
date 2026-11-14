import { FluidHoverHighlight } from "@pp/ui/fluid-hover-highlight"
import {
  useFluidHover,
  useRegisterFluidHoverItem,
  type UseFluidHoverReturn
} from "@pp/ui/hooks/useFluidHover"
import { spring } from "@pp/ui/lib/springs"
import { cn } from "@pp/ui/lib/utils"
import { motion, useReducedMotion } from "motion/react"
import { useRef, type MouseEvent } from "react"

import { groups, pages, type Page } from "./registry"
import { navigate } from "./router"

export function Sidebar({ path }: Readonly<{ path: string }>) {
  const listRef = useRef<HTMLDivElement>(null)
  const hover = useFluidHover(listRef)
  const reduceMotion = useReducedMotion() ?? false
  const activeIndex = pages.findIndex((page) => page.path === path)
  const activeRect =
    hover.isMeasured && activeIndex !== -1
      ? hover.itemRects[activeIndex]
      : undefined

  return (
    <nav aria-label="Components" className="min-h-0 flex-1 overflow-y-auto">
      <div
        ref={listRef}
        role="presentation"
        onMouseEnter={hover.handlers.onMouseEnter}
        onMouseMove={hover.handlers.onMouseMove}
        onMouseLeave={hover.handlers.onMouseLeave}
        onClick={hover.handlers.onClick}
        className="relative flex flex-col"
      >
        {activeRect ? (
          <motion.div
            aria-hidden
            className="pointer-events-none absolute top-0 left-0 rounded-lg bg-accent corner-squircle"
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
        <FluidHoverHighlight
          hover={hover}
          className="rounded-lg corner-squircle"
        />
        {groups.map((group) => (
          <section key={group.name} className="flex flex-col gap-0.5 pb-5">
            <h2 className="px-3 pb-1.5 text-caption text-muted-foreground">
              {group.name}
            </h2>
            {group.pages.map((page) => (
              <SidebarLink
                key={page.slug}
                page={page}
                index={pages.indexOf(page)}
                active={page.path === path}
                registerItem={hover.registerItem}
              />
            ))}
          </section>
        ))}
      </div>
    </nav>
  )
}

function SidebarLink({
  page,
  index,
  active,
  registerItem
}: Readonly<{
  page: Page
  index: number
  active: boolean
  registerItem: UseFluidHoverReturn["registerItem"]
}>) {
  const ref = useRef<HTMLAnchorElement>(null)
  useRegisterFluidHoverItem(registerItem, index, ref)
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return
    event.preventDefault()
    navigate(page.path)
  }
  return (
    <a
      ref={ref}
      href={page.path}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative z-10 rounded-lg px-3 py-1.5 text-body transition-[color,transform] duration-100 active:scale-[0.97]",
        active
          ? "font-semibold text-foreground"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {page.meta.title}
    </a>
  )
}
