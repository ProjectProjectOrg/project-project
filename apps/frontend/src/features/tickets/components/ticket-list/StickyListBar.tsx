import { cn } from "@pp/ui/lib/utils"
import { useLayoutEffect, useRef, type ReactNode } from "react"

export function StickyListBar({
  className,
  children
}: Readonly<{ className?: string; children: ReactNode }>) {
  const ref = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const bar = ref.current
    const scope = bar?.parentElement
    const root = bar?.closest<HTMLElement>("[data-scroll-root]")
    if (!bar || !scope || !root) return undefined
    let frame = 0
    let written = bar.offsetHeight
    let seen = written
    let overridden = false
    scope.style.setProperty("--list-sticky-top", `${written}px`)
    const headers = () =>
      scope.querySelectorAll<HTMLElement>("[data-slot=list-section-header]")
    const update = () => {
      frame = 0
      const height = bar.offsetHeight
      // The variable restyles the whole list, so while the bar resizes only the headers follow it.
      if (height !== seen) {
        seen = height
        overridden = true
        for (const header of headers())
          header.style.setProperty("--list-sticky-top", `${height}px`)
        schedule()
        return
      }
      if (height !== written) {
        written = height
        scope.style.setProperty("--list-sticky-top", `${height}px`)
      }
      if (overridden) {
        overridden = false
        for (const header of headers())
          header.style.removeProperty("--list-sticky-top")
      }
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    const observer = new ResizeObserver(schedule)
    observer.observe(bar)
    const content = root.querySelector(":scope > [data-scroll-content]")
    if (content) observer.observe(content)
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      scope.style.removeProperty("--list-sticky-top")
    }
  }, [])
  return (
    <div
      ref={ref}
      className={cn(
        "sticky top-0 z-20 -mx-6 -mt-3 -mb-3 flex flex-col gap-3 surface-page px-6 py-3",
        className
      )}
    >
      {children}
    </div>
  )
}
