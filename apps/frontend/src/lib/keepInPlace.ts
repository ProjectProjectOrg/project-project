import { flushSync } from "react-dom"

type Edge = "top" | "bottom"

const watched = new WeakSet<HTMLElement>()

/**
 * Runs a height-changing update (collapsing a section, "show less") and then
 * scrolls so `anchor` sits exactly where it was on screen: only the bottom of
 * the page moves. Covers the two ways a collapse otherwise jumps:
 *
 * - A stuck sticky header falls back to its natural spot far above the
 *   viewport, dropping the reader into later sections.
 * - Near the end of the page the content gets shorter than the scroll
 *   position, the browser clamps scrollTop, and everything above slides down.
 *   The shell's `[data-scroll-spacer]` absorbs the missing height instead and
 *   hands it back as the reader scrolls up.
 */
export function keepInPlace(
  anchor: Element,
  change: () => void,
  edge: Edge = "top"
): void {
  const root = anchor.closest<HTMLElement>("[data-scroll-root]")
  if (!root) {
    change()
    return
  }
  const before = edgeOf(anchor, edge)
  flushSync(change)
  if (!anchor.isConnected) return
  const shift = edgeOf(anchor, edge) - before
  if (Math.abs(shift) < 0.5) return
  const target = root.scrollTop + shift
  const spacer = spacerOf(root)
  const overflow = target - (root.scrollHeight - root.clientHeight)
  if (spacer && overflow > 0) {
    setHeight(spacer, spacer.offsetHeight + overflow)
    watch(root, spacer)
  }
  root.scrollTop = target
}

function edgeOf(element: Element, edge: Edge): number {
  const rect = element.getBoundingClientRect()
  return edge === "top" ? rect.top : rect.bottom
}

function spacerOf(root: HTMLElement): HTMLElement | null {
  return root.querySelector<HTMLElement>(":scope > [data-scroll-spacer]")
}

function setHeight(spacer: HTMLElement, height: number): void {
  spacer.style.height = height > 0 ? `${height}px` : ""
}

// Shrinks the spacer to what the current scroll position still needs, so
// scrolling up (or the content growing back) never leaves blank space below.
function watch(root: HTMLElement, spacer: HTMLElement): void {
  if (watched.has(root)) return
  watched.add(root)
  const content = root.querySelector(":scope > [data-scroll-content]")
  const trim = () => {
    const current = spacer.offsetHeight
    const contentEnd = root.scrollHeight - current
    const needed = Math.max(0, root.scrollTop + root.clientHeight - contentEnd)
    if (needed < current) setHeight(spacer, needed)
    if (needed === 0) stop()
  }
  const observer = new ResizeObserver(trim)
  const stop = () => {
    observer.disconnect()
    root.removeEventListener("scroll", trim)
    watched.delete(root)
  }
  observer.observe(root)
  if (content) observer.observe(content)
  root.addEventListener("scroll", trim, { passive: true })
}
