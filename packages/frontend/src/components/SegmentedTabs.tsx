// Shared segmented-tabs primitive.
//
// One component, two callsites: the project-level Tickets/About/Members tabs
// in `routes/_authed/orgs/$orgSlug/projects/$slug/route.tsx` and the All/Todo/In progress/
// Done chips in `components/TicketList.tsx`. Same chrome (rounded-xl border
// container, padded with inner pills), same active-state animation
// (LayoutGroup + a single `motion.span` shared via `layoutId` slides
// between selections with `springs.moderate`), same compact label-collapse
// behaviour.
//
// The two callsites differ in *what each item is wrapped in*: nav links for
// URL-driven tabs, plain buttons for state-driven chips. We expose that as
// a `renderItem` render prop — the component owns chrome + animation +
// content, the callsite owns navigation/state.
//
// `CollapsingLabel` is exported alongside so other toolbar controls
// (TypeFilter / SortMenu) can collapse labels with the same easing.

import { AnimatePresence, LayoutGroup, motion } from "motion/react"
import type { ComponentType, ReactNode } from "react"
import { Fragment, useLayoutEffect, useRef, useState } from "react"
import { springs } from "@/lib/springs"
import { cn } from "@/lib/utils"

type IconCmp = ComponentType<{ className?: string; strokeWidth?: number }>

export type SegmentedItem<K extends string> = {
  key: K
  label: string
  icon?: IconCmp
  iconClassName?: string
  badge?: number | string | null
  badgeNode?: ReactNode
  compactAriaLabel?: string
}

export type SegmentedVariant = "default" | "inline"

type VariantTokens = {
  container: string
  innerGap: string
  iconSize: string
  pillRounding: string
  itemBase: string
}

const VARIANTS: Record<SegmentedVariant, VariantTokens> = {
  default: {
    container:
      "inline-flex items-center gap-0.5 rounded-xl border border-border bg-background p-1",
    innerGap: "gap-1.5",
    iconSize: "size-3.5",
    pillRounding: "rounded-lg",
    itemBase: "h-7 rounded-lg px-2.5 text-sm"
  },
  inline: {
    container: "inline-flex items-center gap-0.5",
    innerGap: "gap-1",
    iconSize: "size-3",
    pillRounding: "rounded-md",
    itemBase: "h-6 rounded-md px-1.5 text-xs"
  }
}

export interface SegmentedTabsProps<K extends string> {
  items: ReadonlyArray<SegmentedItem<K>>
  layoutId: string
  isActive: (key: K) => boolean
  renderItem: (
    item: SegmentedItem<K>,
    content: ReactNode,
    args: { active: boolean }
  ) => ReactNode
  compact?: boolean
  variant?: SegmentedVariant
  className?: string
}

export function SegmentedTabs<K extends string>({
  items,
  layoutId,
  isActive,
  renderItem,
  compact = false,
  variant = "default",
  className
}: SegmentedTabsProps<K>) {
  const v = VARIANTS[variant]
  return (
    <LayoutGroup id={layoutId}>
      <div className={cn(v.container, className)}>
        {items.map((it) => {
          const active = isActive(it.key)
          const Icon = it.icon
          const content = (
            <>
              {active && (
                <motion.span
                  layoutId={`${layoutId}-active`}
                  transition={springs.moderate}
                  className={cn(
                    "absolute inset-0 -z-0 bg-accent",
                    v.pillRounding
                  )}
                />
              )}
              <span
                className={cn(
                  "relative z-10 inline-flex items-center",
                  v.innerGap
                )}
              >
                {Icon && (
                  <Icon
                    className={cn(v.iconSize, it.iconClassName)}
                    strokeWidth={1.75}
                  />
                )}
                <CollapsingLabel show={!compact}>{it.label}</CollapsingLabel>
                {it.badgeNode ??
                  (it.badge !== undefined && it.badge !== null && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
                        active
                          ? "bg-foreground/10 text-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {it.badge}
                    </span>
                  ))}
              </span>
            </>
          )
          return (
            <Fragment key={it.key}>
              {renderItem(it, content, { active })}
            </Fragment>
          )
        })}
      </div>
    </LayoutGroup>
  )
}

// Smoothly collapses a label to zero width when `show` is false.
//
// The `marginLeft: -8` on the hidden states is load-bearing: every parent
// using this component lays out its children with `gap-2` (8px). When the
// label's width animates to 0, flex still keeps that 8px gap on both sides,
// so once AnimatePresence finishes its exit and unmounts the label, the
// surrounding siblings *jump* 8px closer. Animating `marginLeft` from 0 to
// -8 in lockstep with the width absorbs the leading gap throughout the
// animation — by the time the label unmounts, the gap is already at zero,
// and there's nothing left to snap.
//
// Tween rather than spring: springs settle with a tiny overshoot that reads
// as a snap once the exit completes. A flat easeOut is calmer here.
export function CollapsingLabel({
  show,
  children,
  contentKey
}: {
  show: boolean
  children: ReactNode
  contentKey?: string | number
}) {
  const innerRef = useRef<HTMLSpanElement>(null)
  const [width, setWidth] = useState<number | "auto">("auto")

  useLayoutEffect(() => {
    if (innerRef.current) {
      setWidth(innerRef.current.scrollWidth)
    }
  }, [show, contentKey])

  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.span
          key="label"
          initial={{ width: 0, opacity: 0, marginLeft: -8 }}
          animate={{ width, opacity: 1, marginLeft: 0 }}
          exit={{ width: 0, opacity: 0, marginLeft: -8 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="inline-flex items-center overflow-hidden whitespace-nowrap"
        >
          <span ref={innerRef} className="inline-flex shrink-0 items-center">
            <AnimatePresence initial={false} mode="popLayout">
              <motion.span
                key={contentKey ?? "content"}
                initial={{ opacity: 0, filter: "blur(4px)" }}
                animate={{ opacity: 1, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(4px)" }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="inline-flex items-center"
              >
                {children}
              </motion.span>
            </AnimatePresence>
          </span>
        </motion.span>
      )}
    </AnimatePresence>
  )
}

// Shared item button styling. Exported so callsites that render plain
// buttons get the exact same hit-target sizing and active/inactive text
// treatment as the URL-driven tabs. Pass the same `variant` you passed to
// SegmentedTabs so chrome and item sizing stay in sync.
export const SEGMENTED_ITEM_CLASS = (
  active: boolean,
  variant: SegmentedVariant = "default"
) =>
  cn(
    "group/seg-item relative inline-flex items-center transition-colors",
    VARIANTS[variant].itemBase,
    VARIANTS[variant].innerGap,
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  )
