import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

export type MarqueeVariant = "tab" | "strip"

type VariantClasses = Readonly<{
  fit: string
  mask: string
  track: string
  copy: string
}>

const VARIANTS: Readonly<Record<MarqueeVariant, VariantClasses>> = {
  tab: {
    fit: "w-full justify-center gap-2",
    mask: "[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]",
    track:
      "animate-marquee-x [animation-play-state:paused] group-hover/seg-item:[animation-play-state:running]",
    copy: "gap-2 pr-2"
  },
  strip: {
    fit: "gap-3",
    mask: "[mask-image:linear-gradient(to_right,black_85%,transparent)] group-hover/reveal:[mask-image:linear-gradient(to_right,transparent,black_8%,black_85%,transparent)]",
    track:
      "group-hover/reveal:animate-[marquee-x_linear_infinite] motion-reduce:group-hover/reveal:animate-none",
    copy: "gap-3 pr-3"
  }
}

export function MarqueeIfOverflow({
  children,
  variant = "tab",
  speedPxPerSec = 35,
  className
}: Readonly<{
  children: ReactNode
  variant?: MarqueeVariant
  speedPxPerSec?: number
  className?: string
}>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<
    Readonly<{ overflow: boolean; duration: number }>
  >({ overflow: false, duration: 20 })
  const classes = VARIANTS[variant]

  useLayoutEffect(() => {
    const container = containerRef.current
    const measure = measureRef.current
    if (!container || !measure) return
    const update = () => {
      const cw = container.clientWidth
      const iw = measure.scrollWidth
      if (cw === 0 || iw === 0) return
      const overflow = iw > cw
      const duration = Math.max(8, iw / speedPxPerSec)
      setState((prev) =>
        prev.overflow === overflow && Math.abs(prev.duration - duration) < 0.5
          ? prev
          : { overflow, duration }
      )
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(container)
    ro.observe(measure)
    return () => ro.disconnect()
  }, [speedPxPerSec, children])

  return (
    <div
      ref={containerRef}
      data-marquee={state.overflow ? "overflow" : "fit"}
      className={cn(
        "flex h-full w-full min-w-0 items-center overflow-hidden",
        state.overflow && classes.mask,
        className
      )}
    >
      {state.overflow ? (
        <div
          className={cn("flex w-max items-center", classes.track)}
          style={{ animationDuration: `${state.duration}s` }}
        >
          <div
            ref={measureRef}
            className={cn("flex shrink-0 items-center", classes.copy)}
          >
            {children}
          </div>
          <div
            aria-hidden
            className={cn("flex shrink-0 items-center", classes.copy)}
          >
            {children}
          </div>
        </div>
      ) : (
        <div
          ref={measureRef}
          className={cn(
            "flex w-full items-center whitespace-nowrap",
            classes.fit
          )}
        >
          {children}
        </div>
      )}
    </div>
  )
}
