import { useEffect, type RefObject } from "react"

const SETTLE_MS = 150
const GIVE_UP_MS = 4000
const OFFSET = 24

const firstNewOutOfView = (container: HTMLElement): HTMLElement | null => {
  if (container.querySelector('[aria-busy="true"]') !== null) return null
  const target = container.querySelector<HTMLElement>("[data-new-since-read]")
  if (target === null) return null
  const box = container.getBoundingClientRect()
  return target.getBoundingClientRect().bottom > box.bottom ? target : null
}

export function useScrollToNew(
  containerRef: RefObject<HTMLElement | null>,
  key: string | null
) {
  useEffect(() => {
    const container = containerRef.current
    if (container === null || key === null) return undefined
    container.scrollTop = 0
    let settle: number | undefined
    const stop = () => {
      window.clearTimeout(settle)
      window.clearTimeout(giveUp)
      observer.disconnect()
      container.removeEventListener("wheel", stop)
      container.removeEventListener("touchstart", stop)
      container.removeEventListener("keydown", stop)
    }
    const check = () => {
      const target = firstNewOutOfView(container)
      if (target === null) return
      container.scrollTop +=
        target.getBoundingClientRect().top -
        container.getBoundingClientRect().top -
        OFFSET
      stop()
    }
    const observer = new MutationObserver(() => {
      window.clearTimeout(settle)
      settle = window.setTimeout(check, SETTLE_MS)
    })
    const giveUp = window.setTimeout(stop, GIVE_UP_MS)
    observer.observe(container, { childList: true, subtree: true })
    container.addEventListener("wheel", stop, { passive: true })
    container.addEventListener("touchstart", stop, { passive: true })
    container.addEventListener("keydown", stop)
    settle = window.setTimeout(check, SETTLE_MS)
    return stop
  }, [containerRef, key])
}
