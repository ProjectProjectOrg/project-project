import { cn } from "../lib/utils"

const KBD_SIZES = {
  default: "h-5 min-w-5 text-micro",
  sm: "h-4 min-w-4 text-micro-compact leading-none"
} as const

function Kbd({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"kbd"> & { size?: keyof typeof KBD_SIZES }) {
  return (
    <kbd
      data-slot="kbd"
      className={cn(
        "pointer-events-none inline-flex w-fit items-center justify-center gap-1 rounded-sm bg-muted px-1 font-sans text-muted-foreground select-none",
        KBD_SIZES[size],
        "[&_svg:not([class*='size-'])]:size-[1em]",
        // Inside an ink tooltip: a see-through key in the tooltip's text colour.
        "[[data-slot=tooltip-content]_&]:bg-[color-mix(in_oklab,var(--primary-foreground)_16%,transparent)] [[data-slot=tooltip-content]_&]:text-[color-mix(in_oklab,var(--primary-foreground)_80%,var(--foreground))]",
        className
      )}
      {...props}
    />
  )
}

function KbdGroup({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <kbd
      data-slot="kbd-group"
      className={cn("inline-flex items-center gap-1", className)}
      {...props}
    />
  )
}

export { Kbd, KbdGroup }
