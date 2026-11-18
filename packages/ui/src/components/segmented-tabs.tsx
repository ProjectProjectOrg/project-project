import { useRender } from "@base-ui/react/use-render"
import {
  useState,
  type ComponentType,
  type ReactElement,
  type ReactNode
} from "react"

import { SURFACE_BG } from "../lib/surfaceClasses"
import { useSurface } from "../lib/surfaceContext"
import { cn } from "../lib/utils"
import { Badge } from "./badge"
import { CollapsingLabel } from "./collapsing-label"
import { SEGMENT_MOTION, SegmentedIndicator } from "./segmented-indicator"
import { WeightLabel } from "./weight-label"

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

export type SegmentedVariant = "default" | "inline" | "rail" | "subtle"

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
    container:
      "inline-flex w-fit items-center gap-0.5 rounded-[18px] p-1 corner-squircle",
    innerGap: "gap-1.5",
    innerGapPx: 6,
    iconSize: "size-3.5",
    pillRounding: "rounded-[14px] corner-squircle",
    itemBase: "h-7 rounded-[14px] px-2.5 text-body corner-squircle"
  },
  rail: {
    container:
      "inline-flex w-fit items-center gap-0.5 rounded-[14px] bg-tint p-0.5 corner-squircle",
    innerGap: "gap-1",
    innerGapPx: 4,
    iconSize: "size-3",
    pillRounding: "rounded-[12px] corner-squircle",
    itemBase: "h-6 rounded-[12px] px-2 text-caption corner-squircle"
  },
  inline: {
    container: "inline-flex w-fit items-center gap-0.5",
    innerGap: "gap-1",
    innerGapPx: 4,
    iconSize: "size-3",
    pillRounding: "rounded-[12px] corner-squircle",
    itemBase: "h-6 rounded-[12px] px-1.5 text-caption corner-squircle"
  },
  subtle: {
    container: "inline-flex w-fit items-center gap-0.5",
    innerGap: "gap-2",
    innerGapPx: 8,
    iconSize: "size-4",
    pillRounding: "rounded-[16px] corner-squircle",
    itemBase: "h-8 rounded-[16px] px-3 text-body corner-squircle"
  }
}

// The selected pill's edge: a 5-6% hairline, no shadow. Squircle corners
// throughout, at a full radius, with the pill concentric to its track.
const segmentLineClass = "shadow-[inset_0_0_0_1px_var(--segment-line)]"

// Labels open and close in step with the pill.
const labelTransition = {
  duration: SEGMENT_MOTION.durationMs / 1000,
  ease: SEGMENT_MOTION.ease
}

const BARE_VARIANTS: ReadonlySet<SegmentedVariant> = new Set([
  "inline",
  "rail",
  "subtle"
])

export type SegmentedTabsProps<K extends string> = Readonly<{
  items: ReadonlyArray<SegmentedItem<K>>
  value: K | null
  onValueChange?: (key: K) => void
  variant?: SegmentedVariant
  labels?: "all" | "active" | "none"
  /** Fill the container and split it evenly between the options. */
  fill?: boolean
  disabled?: boolean
  focusable?: boolean
  className?: string
  "aria-label"?: string
}>

export function SegmentedTabs<K extends string>({
  items,
  value,
  onValueChange,
  variant = "default",
  labels = "all",
  fill = false,
  disabled,
  focusable = true,
  className,
  "aria-label": ariaLabel
}: SegmentedTabsProps<K>) {
  const v = VARIANTS[variant]
  const surface = useSurface()
  const pillLevel = Math.min(surface + (variant === "rail" ? 7 : 4), 8)
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
        fill && "flex w-full",
        !BARE_VARIANTS.has(variant) && SURFACE_BG[Math.min(surface + 2, 8)],
        className
      )}
    >
      <SegmentedIndicator
        activeIndex={items.findIndex((item) => item.key === value)}
        className={cn(
          (variant === "inline" || variant === "rail") &&
            cn(SURFACE_BG[pillLevel], segmentLineClass),
          subtle &&
            cn(
              "bg-selected/50 transition-opacity duration-150 dark:bg-accent/40",
              hoveringOther && "opacity-80"
            ),
          variant !== "inline" &&
            variant !== "rail" &&
            !subtle &&
            cn("bg-tint", segmentLineClass),
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
          showLabel={
            labels === "all" || (labels === "active" && item.key === value)
          }
          fill={fill}
          hovered={item.key === hovered}
          variant={variant}
          disabled={disabled}
          focusable={focusable}
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
  focusable,
  onSelect,
  onHover,
  fill
}: Readonly<{
  item: SegmentedItem<string>
  active: boolean
  showLabel: boolean
  hovered: boolean
  variant: SegmentedVariant
  fill: boolean
  disabled?: boolean
  focusable: boolean
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
              subtle &&
                "transition-[stroke-width] duration-150 group-hover/seg-item:duration-0",
              item.iconClassName
            )}
            strokeWidth={subtle ? (active || hovered ? 2 : 1.5) : 1.75}
          />
        )}
        <CollapsingLabel
          show={showLabel}
          gap={v.innerGapPx}
          transition={labelTransition}
        >
          {subtle ? (
            <WeightLabel active={active}>{item.label}</WeightLabel>
          ) : (
            item.label
          )}
        </CollapsingLabel>
        {item.badge !== undefined &&
          item.badge !== null &&
          (subtle ? (
            <span className="text-caption text-muted-foreground tabular-nums">
              {item.badge}
            </span>
          ) : (
            <Badge variant="count" active={active}>
              {item.badge}
            </Badge>
          ))}
      </span>
      {hovers && (
        <span className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center gap-2 whitespace-nowrap opacity-0 transition-opacity group-hover/seg-item:opacity-100 group-hover/seg-item:duration-0">
          {item.hoverContent}
        </span>
      )}
    </>
  )
  const className = cn(
    "group/seg-item focus-ring relative inline-flex items-center transition-all duration-100 outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50",
    v.itemBase,
    fill && "flex-1 justify-center",
    v.innerGap,
    // Muted text on the rail's tinted track falls under 4.5:1, so the rail
    // keeps every label in full colour and lets the pill mark the choice.
    active || variant === "rail"
      ? "text-foreground"
      : "text-muted-foreground hover:text-foreground"
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
            tabIndex: focusable ? undefined : -1,
            onClick: onSelect,
            onPointerEnter: onHover,
            onFocus: onHover,
            "aria-pressed": active,
            "aria-label": showLabel ? undefined : item.label
          }
        : { className, children }
  })
}
