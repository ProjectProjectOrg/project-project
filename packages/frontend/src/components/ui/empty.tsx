"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { useRef } from "react"

import { Dither, type TimeWarpZone } from "@/components/ui/dither"
import { cn } from "@/lib/utils"

const EMPTY_WARP_ZONES: TimeWarpZone[] = [
  { anchor: { type: "click" }, radius: 0.7, strength: 3.2, falloff: 3.5 },
  {
    anchor: { type: "fraction", x: 0.5, y: 0.5 },
    radius: 0.7,
    strength: 1.2,
    falloff: 4.5
  }
]

type EmptyVariant = "default" | "inline"

function Empty({
  className,
  variant = "default",
  children,
  ...props
}: React.ComponentProps<"div"> & { variant?: EmptyVariant }) {
  if (variant === "inline") {
    return (
      <div
        data-slot="empty"
        data-variant="inline"
        className={cn(
          "flex min-w-0 flex-1 flex-col items-center justify-center gap-6 rounded-lg border-dashed p-6 text-center text-balance md:p-12",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
  return (
    <EmptyDithered
      className={className}
      {...props}
    >
      {children}
    </EmptyDithered>
  )
}

function EmptyDithered({
  className,
  children,
  ...props
}: React.ComponentProps<"div">) {
  const cardRef = useRef<HTMLDivElement | null>(null)
  return (
    <div
      data-slot="empty"
      data-variant="default"
      className={cn(
        "relative grid min-h-[280px] place-items-center overflow-hidden rounded-xl bg-[color-mix(in_oklch,var(--background)_82%,var(--muted)_18%)] p-8 animate-in fade-in duration-500",
        className
      )}
      {...props}
    >
      <div className="pointer-events-none absolute inset-0">
        <Dither
          speed={0.1}
          octaves={6}
          frequency={1.2}
          amplitude={0.52}
          lacunarity={2.2}
          rotationAngle={0.5}
          warpStrength={1.1}
          contrast={0.2}
          bias={-0.05}
          pixelSize={2}
          ditherType="4x4"
          cardRef={cardRef}
          cardWellEnabled
          cardFalloff={60}
          cardCornerRadius={14}
          timeWarpZones={EMPTY_WARP_ZONES}
        />
      </div>
      <div
        ref={cardRef}
        className="relative flex flex-col items-center gap-2 rounded-2xl px-6 py-5 text-center animate-in fade-in zoom-in-95 duration-500"
      >
        {children}
      </div>
    </div>
  )
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-header"
      className={cn(
        "flex max-w-sm flex-col items-center gap-2 text-center",
        className
      )}
      {...props}
    />
  )
}

const emptyMediaVariants = cva(
  "mb-2 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-transparent",
        icon: "flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground [&_svg:not([class*='size-'])]:size-6"
      }
    },
    defaultVariants: {
      variant: "default"
    }
  }
)

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return (
    <div
      data-slot="empty-icon"
      data-variant={variant}
      className={cn(emptyMediaVariants({ variant, className }))}
      {...props}
    />
  )
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-lg font-medium tracking-tight", className)}
      {...props}
    />
  )
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-sm/relaxed text-muted-foreground [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className
      )}
      {...props}
    />
  )
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn(
        "flex w-full max-w-sm min-w-0 flex-col items-center gap-4 text-sm text-balance",
        className
      )}
      {...props}
    />
  )
}

export {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
  EmptyMedia
}
