import { useRender } from "@base-ui/react/use-render"
import type { ComponentType, ReactElement, ReactNode } from "react"

import { SURFACE_BG } from "@/lib/surfaceClasses"
import { useSurface } from "@/lib/surfaceContext"
import { cn } from "@/lib/utils"

import { CollapsingLabel } from "./collapsing-label"
import { SegmentedIndicator } from "./segmented-indicator"

type IconCmp = ComponentType<{ className?: string; strokeWidth?: number }>

export type SegmentedItem<K extends string> = Readonly<{
  key: K
  label: string
  icon?: IconCmp
  iconClassName?: string
  badge?: number | string | null
  hoverContent?: ReactNode
  render?: ReactElement
}>

export type SegmentedVariant = "default" | "inline" | "view"

type VariantTokens = Readonly<{
  container: string
  innerGap: string
  innerGapPx: number
  iconSize: string
  pillRounding: string
  itemBase: string
}>

const VARIANTS: Readonly<Record<SegmentedVariant, VariantTokens>> = {
  default: {
    container: "inline-flex items-center gap-0.5 rounded-xl p-1",
    innerGap: "gap-1.5",
    innerGapPx: 6,
    iconSize: "size-3.5",
    pillRounding: "rounded-lg",
    itemBase: "h-7 rounded-lg px-2.5 text-sm"
  },
  view: {
    container: "flex w-full items-center gap-0.5 rounded-xl p-0.5",
    innerGap: "gap-1",
    innerGapPx: 4,
    iconSize: "size-3.5",
    pillRounding: "rounded-lg",
    itemBase: "h-7 flex-1 justify-center rounded-lg px-2.5 text-xs"
  },
  inline: {
    container: "inline-flex items-center gap-0.5",
    innerGap: "gap-1",
    innerGapPx: 4,
    iconSize: "size-3",
    pillRounding: "rounded-md",
    itemBase: "h-6 rounded-md px-1.5 text-xs"
  }
}

export type SegmentedTabsProps<K extends string> = Readonly<{
  items: ReadonlyArray<SegmentedItem<K>>
  value: K | null
  onValueChange?: (key: K) => void
  variant?: SegmentedVariant
  labels?: "all" | "active"
  disabled?: boolean
  className?: string
  "aria-label"?: string
}>

export function SegmentedTabs<K extends string>({
  items,
  value,
  onValueChange,
  variant = "default",
  labels = "all",
  disabled,
  className,
  "aria-label": ariaLabel
}: SegmentedTabsProps<K>) {
  const v = VARIANTS[variant]
  const surface = useSurface()
  const pillLevel = Math.min(surface + 4, 8)
  return (
    <div
      role={ariaLabel === undefined ? undefined : "group"}
      aria-label={ariaLabel}
      className={cn(
        "relative",
        v.container,
        variant !== "inline" && SURFACE_BG[Math.min(surface + 2, 8)],
        className
      )}
    >
      <SegmentedIndicator
        activeIndex={items.findIndex((item) => item.key === value)}
        className={cn(
          variant === "inline"
            ? cn(SURFACE_BG[pillLevel], "shadow-surface-1")
            : "bg-tint",
          v.pillRounding
        )}
      />
      {items.map((item) => (
        <SegmentedTab
          key={item.key}
          item={item}
          active={item.key === value}
          showLabel={labels === "all" || item.key === value}
          variant={variant}
          disabled={disabled}
          onSelect={() => {
            if (item.key !== value) onValueChange?.(item.key)
          }}
        />
      ))}
    </div>
  )
}

function SegmentedTab({
  item,
  active,
  showLabel,
  variant,
  disabled,
  onSelect
}: Readonly<{
  item: SegmentedItem<string>
  active: boolean
  showLabel: boolean
  variant: SegmentedVariant
  disabled?: boolean
  onSelect: () => void
}>) {
  const v = VARIANTS[variant]
  const Icon = item.icon
  const hovers = item.hoverContent !== undefined
  const children = (
    <>
      <span
        className={cn(
          "relative z-10 inline-flex items-center",
          v.innerGap,
          hovers &&
            "transition-opacity group-hover/seg-item:opacity-0 group-hover/seg-item:duration-0"
        )}
      >
        {Icon && (
          <Icon
            className={cn(v.iconSize, item.iconClassName)}
            strokeWidth={1.75}
          />
        )}
        <CollapsingLabel show={showLabel} gap={v.innerGapPx}>
          {item.label}
        </CollapsingLabel>
        {item.badge !== undefined && item.badge !== null && (
          <span
            className={cn(
              "rounded-full px-1.5 font-mono text-[10px] tabular-nums",
              active
                ? "bg-foreground/10 text-foreground"
                : "bg-muted text-muted-foreground"
            )}
          >
            {item.badge}
          </span>
        )}
      </span>
      {hovers && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 whitespace-nowrap opacity-0 transition-opacity group-hover/seg-item:opacity-100 group-hover/seg-item:duration-0">
          {item.hoverContent}
        </span>
      )}
    </>
  )
  const className = cn(
    "group/seg-item relative inline-flex items-center transition-all duration-100 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
    v.itemBase,
    v.innerGap,
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
  )
  return useRender({
    defaultTagName: "button",
    render: item.render,
    props:
      item.render === undefined
        ? {
            type: "button",
            className,
            children,
            disabled,
            onClick: onSelect,
            "aria-pressed": active,
            "aria-label": showLabel ? undefined : item.label
          }
        : { className, children }
  })
}
