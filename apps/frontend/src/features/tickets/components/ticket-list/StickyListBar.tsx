import { cn } from "@pp/ui/lib/utils"
import { useLayoutEffect, useRef, type ReactNode } from "react"

// The list's creator and toolbar, pinned to the top of the scroll area. Once
// pinned it takes the page fill and a short fade along its bottom edge, so
// rows passing under it don't show through. Its height goes to
// --list-sticky-top, where section headers pin.
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
    const update = () => {
      frame = 0
      scope.style.setProperty("--list-sticky-top", `${bar.offsetHeight}px`)
      const pinned =
        root.scrollTop > 0 &&
        bar.getBoundingClientRect().top <= root.getBoundingClientRect().top + 1
      bar.toggleAttribute("data-stuck", pinned)
    }
    const schedule = () => {
      if (frame === 0) frame = requestAnimationFrame(update)
    }
    update()
    const observer = new ResizeObserver(schedule)
    observer.observe(bar)
    root.addEventListener("scroll", schedule, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      root.removeEventListener("scroll", schedule)
      scope.style.removeProperty("--list-sticky-top")
    }
  }, [])
  return (
    <div
      ref={ref}
      className={cn(
        "sticky top-0 z-20 -mx-6 -mt-3 -mb-3 flex flex-col gap-3 px-6 pt-3 pb-3",
        "data-stuck:surface-page",
        "after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:bg-linear-to-b after:from-page after:to-transparent after:opacity-0 data-stuck:after:opacity-100",
        // A section header pinned right under the bar already hides the rows.
        "[&:has(~*_[data-slot=list-section-header][data-stuck])]:after:opacity-0",
        className
      )}
    >
      {children}
    </div>
  )
}
