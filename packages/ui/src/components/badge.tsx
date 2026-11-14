import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"
import * as React from "react"

import { cn } from "../lib/utils"

// Each tone only names its colour; theme.css (.pp-badge) builds the fill, the
// ink and the sheen from it in oklch, so every tone stays clean in both
// themes. `tone={null}` leaves --badge-tone to the caller, such as a tag with
// a user-picked hue.
const BADGE_TONE_COLOURS = {
  muted: "",
  emerald: "[--badge-tone:var(--state-success)]",
  red: "[--badge-tone:var(--state-danger)]",
  amber: "[--badge-tone:var(--state-warning)]",
  blue: "[--badge-tone:var(--state-info)]",
  violet: "[--badge-tone:var(--state-merged)]"
} as const

// Corners at half the height, shaped like the buttons'. Like the buttons, a
// leading icon takes about a quarter off the left padding, because an icon's
// box carries its own empty space. Only the leading side: CSS skips bare text,
// so in `<Icon />Owner` the icon is also :last-child.
const badgeVariants = cva(
  "pp-badge focus-ring inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap transition-[scale] duration-100 [corner-shape:var(--button-corner)] [&>svg]:pointer-events-none [&>svg]:size-3 [&>svg]:shrink-0",
  {
    variants: {
      variant: {
        soft: "",
        outline: "",
        count:
          "h-[18px]! min-w-[18px] justify-center rounded-[9px]! px-[5px]! font-mono text-micro! leading-none tabular-nums"
      },
      tone: BADGE_TONE_COLOURS,
      size: {
        xs: "h-5 rounded-[10px] px-1.5 text-micro has-[>svg:first-child]:pl-1",
        sm: "h-6 rounded-[12px] px-2 text-caption has-[>svg:first-child]:pl-1.5",
        md: "h-7 rounded-[14px] px-2.5 text-caption has-[>svg:first-child]:pl-2"
      }
    },
    defaultVariants: {
      variant: "soft",
      tone: "muted",
      size: "sm"
    }
  }
)

type BadgeProps = React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> &
  Readonly<{
    render?: useRender.RenderProp
    // A count that belongs to the active filter or tab reads in foreground.
    active?: boolean
  }>

function Badge({
  className,
  variant = "soft",
  tone = "muted",
  size,
  active,
  render,
  ...props
}: BadgeProps) {
  return useRender({
    defaultTagName: "span",
    render,
    props: {
      "data-slot": "badge",
      "data-variant": variant ?? "soft",
      "data-tone": variant === "soft" ? (tone ?? undefined) : undefined,
      "data-active": active ? "" : undefined,
      ...props,
      className: cn(badgeVariants({ variant, tone, size }), className)
    }
  })
}

export type BadgeTone = NonNullable<VariantProps<typeof badgeVariants>["tone"]>
export type BadgeSize = NonNullable<VariantProps<typeof badgeVariants>["size"]>
export type BadgeVariant = NonNullable<
  VariantProps<typeof badgeVariants>["variant"]
>

export { Badge, badgeVariants }
