import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { type ReactNode } from "react"

import { transitions } from "../lib/springs"
import { cn } from "../lib/utils"
import { Button } from "./button"
import { X } from "./icons"
import { itemSurfaceClass } from "./item-link"

type SidebarCardProps = Readonly<{
  open: boolean
  title: string
  meta?: ReactNode
  // Shown at the top, edge to edge inside the card: a video or an image.
  media?: ReactNode
  // An ItemLink stretched over the card, so a click anywhere opens it.
  link?: ReactNode
  dismissLabel: string
  onDismiss: () => void
  children: ReactNode
  className?: string
}>

function SidebarCard({
  open,
  title,
  meta,
  media,
  link,
  dismissLabel,
  onDismiss,
  children,
  className
}: SidebarCardProps) {
  const reduce = useReducedMotion() ?? false
  const offset = reduce ? 0 : 8
  return (
    <AnimatePresence initial={false}>
      {open ? (
        <motion.section
          data-slot="sidebar-card"
          aria-label={title}
          className={cn(
            "group/sidebar-card relative isolate mx-2 mb-2 shrink-0 rounded-[18px] surface-3 p-1.5 text-foreground shadow-surface-1 [corner-shape:var(--button-corner)]",
            // A linked card is a board card: it lifts on hover and focus.
            link !== undefined &&
              "transition hover:surface-4 hover:shadow-surface-1-hover has-[[data-item-link]:focus-visible]:surface-4 has-[[data-item-link]:focus-visible]:shadow-surface-1-hover has-[[data-item-link]:focus-visible]:duration-0",
            itemSurfaceClass,
            className
          )}
          initial={{ opacity: 0, y: offset }}
          animate={{ opacity: 1, y: 0, transition: transitions.presence }}
          exit={{ opacity: 0, y: offset, transition: transitions.fade }}
        >
          {link}
          {media === undefined ? null : (
            <div className="overflow-hidden rounded-[12px] [corner-shape:var(--button-corner)]">
              {media}
            </div>
          )}
          {/* The card's links and buttons are lifted over its link with
              `relative`, so the ✕ is placed by a wrapper of its own. */}
          <div
            className={cn(
              "absolute z-20 flex",
              media === undefined ? "top-1.5 right-1.5" : "top-3 right-3"
            )}
          >
            <Button
              variant={media === undefined ? "ghost" : "overlay"}
              size="square-6"
              aria-label={dismissLabel}
              onClick={onDismiss}
              className="text-muted-foreground"
            >
              <X className="size-3.5" />
            </Button>
          </div>
          <div className="p-1.5">
            <div
              className={cn(
                "flex flex-col gap-0.5",
                media === undefined && "pr-6"
              )}
            >
              <h2 className="text-caption font-semibold">{title}</h2>
              {meta === undefined ? null : (
                <p className="text-micro text-muted-foreground tabular-nums">
                  {meta}
                </p>
              )}
            </div>
            <div className="mt-2 text-caption text-muted-foreground">
              {children}
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>
  )
}

export { SidebarCard }
export type { SidebarCardProps }
