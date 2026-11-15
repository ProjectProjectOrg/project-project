import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import * as Match from "effect/Match"
import {
  useState,
  type AnimationEvent,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type FocusEvent,
  type MouseEvent,
  type Ref
} from "react"

import type { IconComponent } from "../lib/icon"
import { SURFACE_BG } from "../lib/surfaceClasses"
import { useOnPage, useSurface } from "../lib/surfaceContext"
import { cn } from "../lib/utils"
import {
  DitherBackdrop,
  type DitherDirection,
  type DitherMatrix,
  type DitherStops
} from "./button-dither"
import { LogoLoader } from "./logo"

const buttonVariants = cva(
  [
    "group relative inline-flex cursor-pointer items-center justify-center whitespace-nowrap outline-none",
    "motion-safe:transition-all motion-safe:duration-100 motion-safe:active:scale-[0.97]",
    // Disabled keeps pointer events so the not-allowed cursor shows; hover
    // and press styles are guarded with not-disabled. Loading is disabled
    // too, but stays at full strength with a progress cursor.
    "disabled:not-data-loading:cursor-not-allowed disabled:not-data-loading:opacity-50 disabled:active:scale-100 data-loading:cursor-progress",
    "focus-ring"
  ],
  {
    variants: {
      variant: {
        "appearance-row":
          "w-full justify-start text-left whitespace-normal not-disabled:hover:bg-hover motion-safe:active:scale-100",
        "selection-card":
          "flex-1 justify-start border border-border text-left whitespace-normal not-disabled:hover:bg-hover aria-pressed:border-foreground",
        dropzone:
          "flex-col border border-dashed border-border whitespace-normal not-disabled:hover:bg-hover data-[dragging=true]:border-ring data-[dragging=true]:bg-accent/60",
        "artwork-option":
          "group/reveal flex-col items-stretch text-left whitespace-normal",

        "image-option":
          "overflow-hidden bg-muted ring-1 ring-border not-disabled:hover:ring-ring aria-pressed:ring-2 aria-pressed:ring-foreground",
        // Fill, sheen and edge live in theme.css (.button-fill), tuned by
        // the --button-* tokens.
        primary: "button-fill button-primary",
        secondary: "button-fill button-secondary",
        destructive: "button-fill button-destructive",
        // A tile one step up the surface ladder, no border. On the page
        // itself that step is too faint, so it takes half of secondary's tint.
        tertiary:
          "text-foreground not-disabled:hover:bg-[image:linear-gradient(var(--hover),var(--hover))] not-disabled:active:bg-[image:linear-gradient(var(--active),var(--active))] data-[popup-open]:bg-[image:linear-gradient(var(--hover),var(--hover))] [&[aria-haspopup]]:active:bg-[image:linear-gradient(var(--hover),var(--hover))]",
        ghost:
          "bg-transparent text-muted-foreground not-disabled:hover:bg-hover not-disabled:hover:text-foreground not-disabled:active:bg-active aria-pressed:bg-active aria-pressed:text-foreground data-[popup-open]:bg-hover data-[popup-open]:text-foreground [&[aria-haspopup]]:active:bg-hover",
        toolbar:
          "rounded-md bg-transparent text-muted-foreground not-disabled:hover:text-foreground aria-pressed:bg-active aria-pressed:text-foreground data-fluid-hover-active:text-foreground motion-safe:active:scale-100 [&>svg]:transition-transform [&>svg]:duration-100 motion-safe:active:[&>svg]:scale-[0.97] motion-reduce:[&>svg]:transition-none",
        overlay:
          "bg-background text-muted-foreground shadow-sm not-disabled:hover:bg-[image:linear-gradient(var(--hover),var(--hover))] not-disabled:hover:text-foreground not-disabled:active:bg-[image:linear-gradient(var(--active),var(--active))] data-[popup-open]:bg-[image:linear-gradient(var(--hover),var(--hover))] data-[popup-open]:text-foreground [&[aria-haspopup]]:active:bg-[image:linear-gradient(var(--hover),var(--hover))]",
        // A control that holds a value, like a select trigger: the same
        // fill, hairline and invalid state as Input, foreground text.
        field:
          // Tints like Input (fieldTintClass): --field-hover on hover, and
          // the lighter --field-focus while focused or while its popup is
          // open, over the fill as an inset shadow.
          "justify-between border border-(--segment-line) bg-field text-left text-foreground not-disabled:hover:shadow-[inset_0_0_0_100vmax_var(--field-hover)] not-disabled:hover:duration-0 focus-visible:shadow-[inset_0_0_0_100vmax_var(--field-focus)] aria-invalid:border-destructive data-[popup-open]:shadow-[inset_0_0_0_100vmax_var(--field-focus)]",
        dither: "overflow-hidden bg-transparent"
      },
      size: {
        "appearance-row": "h-auto gap-3 p-3",
        "selection-card": "h-auto gap-2.5 p-2.5",
        dropzone: "h-auto gap-1 px-4 py-8",
        "artwork-option": "h-auto gap-1.5 p-0",

        "image-option": "aspect-[3/1] h-auto w-full p-0",
        "image-strip": "h-12 w-full p-0",
        "banner-add": "h-12 w-full justify-start gap-1.5 px-4 text-body",
        step: "h-auto min-h-8 gap-3 px-3 text-body",
        xs: "h-5 gap-1 px-1.5 text-micro",
        compact: "h-6 gap-0.5 px-1.5 text-caption",
        sm: "h-7 gap-1 px-3 text-caption",
        md: "h-8 gap-1.5 px-4 text-body",
        lg: "h-9 gap-1.5 px-5 text-body",
        "icon-xs": "h-5 w-5 p-0 [&_svg]:h-3 [&_svg]:w-3",
        "block-grip": "size-5 p-0",
        "icon-sm": "h-8 w-8 p-0 [&_svg]:h-3.5 [&_svg]:w-3.5",
        icon: "h-9 w-9 p-0 [&_svg]:h-4 [&_svg]:w-4",
        "icon-lg": "h-10 w-10 p-0 [&_svg]:h-5 [&_svg]:w-5",
        "square-6": "size-6 shrink-0 p-0",
        "square-7": "size-7 shrink-0 p-0",
        "square-8": "size-8 shrink-0 p-0",
        "square-9": "size-9 shrink-0 p-0"
      },
      // Ghost: muted text that brightens on hover (default), or full
      // foreground text for triggers that show a value, like ticket fields.
      // Overlay: destructive turns the hover red, for remove actions.
      tone: { muted: "", strong: "", destructive: "" },
      iconLeft: { true: "" },
      iconRight: { true: "" },
      bleed: { start: "", end: "" }
    },
    compoundVariants: [
      { size: "banner-add", className: "text-muted-foreground" },
      // Optical padding: the icon side gets 3/4 of the text side, because an
      // icon carries less visual weight than a word and Lucide glyphs sit
      // inside about 1/12 of empty space.
      { size: "xs", iconLeft: true, className: "pl-1" },
      { size: "compact", iconLeft: true, className: "pl-1" },
      { size: "sm", iconLeft: true, className: "pl-[9px]" },
      { size: "md", iconLeft: true, className: "pl-3" },
      { size: "lg", iconLeft: true, className: "pl-[15px]" },
      { size: "xs", bleed: "start", className: "-ml-1.5" },
      { size: "xs", bleed: "end", className: "-mr-1.5" },
      { size: "sm", bleed: "start", className: "-ml-3" },
      { size: "sm", bleed: "end", className: "-mr-3" },
      { size: "md", bleed: "start", className: "-ml-4" },
      { size: "md", bleed: "end", className: "-mr-4" },
      { size: "xs", iconRight: true, className: "pr-1" },
      { size: "compact", iconRight: true, className: "pr-1" },
      { size: "sm", iconRight: true, className: "pr-[9px]" },
      { size: "md", iconRight: true, className: "pr-3" },
      { size: "lg", iconRight: true, className: "pr-[15px]" },
      { variant: "ghost", tone: "strong", className: "text-foreground" },
      // Field buttons pad like Input, not like a button.
      { variant: "field", size: ["md", "lg"], className: "px-3" },
      { variant: "field", size: "sm", className: "px-2.5" },
      {
        variant: "overlay",
        tone: "destructive",
        className:
          "not-disabled:hover:bg-destructive-light not-disabled:hover:bg-none not-disabled:hover:text-destructive not-disabled:active:bg-destructive-light not-disabled:active:bg-none"
      },
      // Ghost has no fill at rest, so its label sits closer to the edge.
      { variant: "ghost", size: "md", className: "px-2.5" },
      { variant: "ghost", size: "md", iconLeft: true, className: "pl-2" },
      { variant: "ghost", size: "md", iconRight: true, className: "pr-2" },
      {
        variant: "ghost",
        size: "square-6",
        className:
          "relative before:absolute before:-inset-x-0.5 before:-inset-y-2 before:content-[''] [&_svg]:size-4"
      }
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
      tone: "muted"
    }
  }
)

// Corners at half the button's height, shaped by --button-corner in
// theme.css (squircle is superellipse(2), round is 1). Sizes without a fixed
// height keep the 20px rounding.
type ButtonSize = NonNullable<VariantProps<typeof buttonVariants>["size"]>

const BUTTON_RADIUS: Partial<Record<ButtonSize, string>> = {
  xs: "rounded-[10px] [corner-shape:var(--button-corner)]",
  "icon-xs": "rounded-[10px] [corner-shape:var(--button-corner)]",
  "block-grip": "rounded-[10px] [corner-shape:var(--button-corner)]",
  compact: "rounded-[12px] [corner-shape:var(--button-corner)]",
  "square-6": "rounded-[12px] [corner-shape:var(--button-corner)]",
  sm: "rounded-[14px] [corner-shape:var(--button-corner)]",
  "square-7": "rounded-[14px] [corner-shape:var(--button-corner)]",
  md: "rounded-[16px] [corner-shape:var(--button-corner)]",
  "icon-sm": "rounded-[16px] [corner-shape:var(--button-corner)]",
  "square-8": "rounded-[16px] [corner-shape:var(--button-corner)]",
  lg: "rounded-[18px] [corner-shape:var(--button-corner)]",
  icon: "rounded-[18px] [corner-shape:var(--button-corner)]",
  "square-9": "rounded-[18px] [corner-shape:var(--button-corner)]",
  "icon-lg": "rounded-[20px] [corner-shape:var(--button-corner)]"
}

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> &
  VariantProps<typeof buttonVariants> & {
    ref?: Ref<HTMLButtonElement>
    render?: useRender.RenderProp
    loading?: boolean
    leadingIcon?: IconComponent
    trailingIcon?: IconComponent
    ditherFrom?: string
    ditherTo?: string
    ditherDirection?: DitherDirection
    ditherStops?: DitherStops
    ditherHoverStops?: DitherStops
    ditherHoverDuration?: number
    ditherMatrix?: DitherMatrix
    ditherPixelSize?: number
    // The fill drains toward the start over `seconds`, then `onElapsed`
    // runs; for filled variants (destructive, secondary). Hovering or
    // keyboard focus holds it, on the button or on a [data-countdown-hold]
    // ancestor. `delay` waits before draining, e.g. for an entrance.
    countdown?: ButtonCountdown
  }

type ButtonCountdown = Readonly<{
  seconds: number
  onElapsed: () => void
  delay?: number
}>

// Button's countdown: the timing variables for theme.css, and onElapsed when
// the drain (on ::before, so the event's target is the button) finishes.
function useCountdown(
  countdown: ButtonCountdown | undefined,
  style: CSSProperties | undefined,
  onAnimationEnd: ((e: AnimationEvent<HTMLButtonElement>) => void) | undefined
) {
  const countdownStyle: CSSProperties | undefined =
    countdown === undefined
      ? style
      : {
          ...style,
          "--countdown": `${countdown.seconds}s`,
          "--countdown-delay": `${countdown.delay ?? 0}s`
        }
  const handleAnimationEnd = (e: AnimationEvent<HTMLButtonElement>) => {
    if (e.animationName === "button-countdown" && e.target === e.currentTarget)
      countdown?.onElapsed()
    onAnimationEnd?.(e)
  }
  return { countdownStyle, handleAnimationEnd }
}

function Button({
  className,
  variant,
  size,
  tone,
  bleed,
  render,
  ref,
  loading = false,
  leadingIcon: LeadingIcon,
  trailingIcon: TrailingIcon,
  disabled,
  children,
  style,
  ditherFrom,
  ditherTo,
  ditherDirection,
  ditherStops,
  ditherHoverStops,
  ditherHoverDuration,
  ditherMatrix,
  ditherPixelSize,
  countdown,
  onAnimationEnd,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  ...props
}: ButtonProps) {
  const isDither = variant === "dither"
  const needsDitherHover = isDither && !!ditherHoverStops
  const [isPointerOver, setIsPointerOver] = useState(false)
  const [isFocused, setIsFocused] = useState(false)
  const ditherHover = needsDitherHover && (isPointerOver || isFocused)

  const handleMouseEnter = (e: MouseEvent<HTMLButtonElement>) => {
    if (needsDitherHover) setIsPointerOver(true)
    onMouseEnter?.(e)
  }
  const handleMouseLeave = (e: MouseEvent<HTMLButtonElement>) => {
    if (needsDitherHover) setIsPointerOver(false)
    onMouseLeave?.(e)
  }
  const handleFocus = (e: FocusEvent<HTMLButtonElement>) => {
    if (needsDitherHover) setIsFocused(true)
    onFocus?.(e)
  }
  const handleBlur = (e: FocusEvent<HTMLButtonElement>) => {
    if (needsDitherHover) setIsFocused(false)
    onBlur?.(e)
  }

  const isIconOnly =
    size === "icon" ||
    size === "icon-xs" ||
    size === "icon-sm" ||
    size === "icon-lg"
  const iconSize = Match.value(size).pipe(
    Match.when("xs", () => 12),
    Match.when("sm", () => 14),
    Match.when("lg", () => 20),
    Match.orElse(() => 16)
  )
  const loaderClassName =
    size === "xs" || size === "icon-xs"
      ? "size-3"
      : size === "sm" || size === "icon-sm"
        ? "size-3.5"
        : size === "lg" || size === "icon-lg"
          ? "size-5"
          : "size-4"
  const surface = useSurface()
  const onPage = useOnPage()

  const compClassName = cn(
    buttonVariants({
      variant,
      size,
      tone,
      bleed,
      iconLeft: !isIconOnly && !!LeadingIcon,
      iconRight: !isIconOnly && !!TrailingIcon
    }),
    variant === "tertiary" &&
      (onPage
        ? "button-fill button-tertiary"
        : SURFACE_BG[Math.min(surface + 2, 8)]),
    variant !== "toolbar" && (BUTTON_RADIUS[size ?? "md"] ?? "rounded-[20px]"),
    countdown !== undefined && "button-countdown",
    className
  )
  const { countdownStyle, handleAnimationEnd } = useCountdown(
    countdown,
    style,
    onAnimationEnd
  )
  const leadingIconNode = LeadingIcon && (
    <LeadingIcon
      size={iconSize}
      strokeWidth={1.5}
      className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
    />
  )
  const trailingIconNode = TrailingIcon && (
    <TrailingIcon
      size={iconSize}
      strokeWidth={1.5}
      className="transition-[stroke-width] duration-80 group-hover:stroke-[2]"
    />
  )

  const ditherBackdrop = isDither && (
    <DitherBackdrop
      from={ditherFrom}
      to={ditherTo}
      direction={ditherDirection}
      stops={ditherStops}
      hoverStops={ditherHoverStops}
      hoverDuration={ditherHoverDuration}
      hover={ditherHover}
      matrix={ditherMatrix}
      pixelSize={ditherPixelSize}
    />
  )

  let composedChildren: React.ReactNode

  if (loading) {
    composedChildren = (
      <>
        {ditherBackdrop}
        <span className="relative z-10 flex items-center justify-center gap-[inherit] opacity-0">
          {LeadingIcon && !isIconOnly && (
            <LeadingIcon size={iconSize} strokeWidth={2} />
          )}
          {children}
          {TrailingIcon && !isIconOnly && (
            <TrailingIcon size={iconSize} strokeWidth={2} />
          )}
        </span>
        <span className="absolute inset-0 z-10 grid place-items-center">
          <LogoLoader tone="current" className={loaderClassName} />
        </span>
      </>
    )
  } else if (isIconOnly) {
    composedChildren = (
      <>
        {ditherBackdrop}
        <span
          className={cn(
            "[&_svg]:stroke-[1.5] [&_svg]:transition-[stroke-width] [&_svg]:duration-80 group-hover:[&_svg]:stroke-[2]",
            isDither && "relative z-10"
          )}
        >
          {children}
        </span>
      </>
    )
  } else if (isDither) {
    composedChildren = (
      <>
        {ditherBackdrop}
        <span className="relative z-10 inline-flex items-center gap-[inherit]">
          {leadingIconNode}
          {children}
          {trailingIconNode}
        </span>
      </>
    )
  } else {
    composedChildren = (
      <>
        {leadingIconNode}
        {children}
        {trailingIconNode}
      </>
    )
  }

  return useRender({
    defaultTagName: "button",
    render,
    props: {
      ...props,
      ref,
      "data-slot": "button",
      className: compClassName,
      disabled: disabled || loading,
      "data-loading": loading || undefined,
      style: countdownStyle,
      onAnimationEnd: handleAnimationEnd,
      onMouseEnter: handleMouseEnter,
      onMouseLeave: handleMouseLeave,
      onFocus: handleFocus,
      onBlur: handleBlur,
      children: composedChildren
    }
  })
}

Button.displayName = "Button"

export { Button, buttonVariants }
export type { ButtonCountdown, ButtonProps }
