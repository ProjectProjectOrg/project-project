import { useRender } from "@base-ui/react/use-render"
import {
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode
} from "react"

import { fontWeights } from "@/lib/fontWeight"
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

export type SegmentedVariant = "default" | "inline" | "view" | "subtle"

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
  },
  subtle: {
    container: "inline-flex items-center gap-0.5",
    innerGap: "gap-2",
    innerGapPx: 8,
    iconSize: "size-4",
    pillRounding: "rounded-[20px]",
    itemBase: "h-8 rounded-[20px] px-3 text-[13px]"
  }
}

const BARE_VARIANTS: ReadonlySet<SegmentedVariant> = new Set([
  "inline",
  "subtle"
])

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
  const subtle = variant === "subtle"
  const [hovered, setHovered] = useState<K | null>(null)
  const hoveringOther = hovered !== null && hovered !== value
  return (
    <div
      role={ariaLabel === undefined ? undefined : "group"}
      aria-label={ariaLabel}
      data-hovered={hoveringOther || undefined}
      onPointerLeave={subtle ? () => setHovered(null) : undefined}
      onBlur={
        subtle
          ? (e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) setHovered(null)
            }
          : undefined
      }
      className={cn(
        "relative",
        v.container,
        !BARE_VARIANTS.has(variant) && SURFACE_BG[Math.min(surface + 2, 8)],
        className
      )}
    >
      <SegmentedIndicator
        activeIndex={items.findIndex((item) => item.key === value)}
        className={cn(
          variant === "inline" && cn(SURFACE_BG[pillLevel], "shadow-surface-1"),
          subtle &&
            cn(
              "bg-selected/50 transition-opacity duration-150 dark:bg-accent/40",
              hoveringOther && "opacity-80"
            ),
          variant !== "inline" && !subtle && "bg-tint",
          v.pillRounding
        )}
      />
      {subtle && (
        <SegmentedIndicator
          activeIndex={items.findIndex(
            (item) => item.key === (hovered ?? value)
          )}
          className={cn(
            "bg-accent/60 transition-opacity duration-150 dark:bg-accent/30",
            hoveringOther ? "opacity-40" : "opacity-0",
            v.pillRounding
          )}
        />
      )}
      {items.map((item) => (
        <SegmentedTab
          key={item.key}
          item={item}
          active={item.key === value}
          showLabel={labels === "all" || item.key === value}
          hovered={item.key === hovered}
          variant={variant}
          disabled={disabled}
          onHover={subtle ? () => setHovered(item.key) : undefined}
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
  hovered,
  variant,
  disabled,
  onSelect,
  onHover
}: Readonly<{
  item: SegmentedItem<string>
  active: boolean
  showLabel: boolean
  hovered: boolean
  variant: SegmentedVariant
  disabled?: boolean
  onSelect: () => void
  onHover?: () => void
}>) {
  const v = VARIANTS[variant]
  const subtle = variant === "subtle"
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
            className={cn(
              v.iconSize,
              subtle && "transition-[stroke-width] duration-75",
              item.iconClassName
            )}
            strokeWidth={subtle ? (active || hovered ? 2 : 1.5) : 1.75}
          />
        )}
        <CollapsingLabel show={showLabel} gap={v.innerGapPx}>
          {subtle ? (
            <WeightShiftLabel label={item.label} bold={active} />
          ) : (
            item.label
          )}
        </CollapsingLabel>
        {item.badge !== undefined && item.badge !== null && (
          <span
            className={cn(
              "tabular-nums",
              subtle
                ? "text-xs text-muted-foreground"
                : cn(
                    "rounded-full px-1.5 font-mono text-[10px]",
                    active
                      ? "bg-foreground/10 text-foreground"
                      : "bg-muted text-muted-foreground"
                  )
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
    active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
    subtle && "outline-none focus-visible:ring-1 focus-visible:ring-ring"
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
            onPointerEnter: onHover,
            onFocus: onHover,
            "aria-pressed": active,
            "aria-label": showLabel ? undefined : item.label
          }
        : { className, children }
  })
}

function WeightShiftLabel({
  label,
  bold
}: Readonly<{ label: string; bold: boolean }>) {
  return (
    <span className="inline-grid whitespace-nowrap">
      <span
        aria-hidden
        className="invisible col-start-1 row-start-1"
        style={{ fontVariationSettings: fontWeights.semibold }}
      >
        {label}
      </span>
      <span
        className="col-start-1 row-start-1 transition-[font-variation-settings] duration-75"
        style={{
          fontVariationSettings: bold
            ? fontWeights.semibold
            : fontWeights.normal
        }}
      >
        {label}
      </span>
    </span>
  )
}
