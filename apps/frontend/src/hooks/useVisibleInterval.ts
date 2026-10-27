import { useEffect, useEffectEvent } from "react"

type VisibleIntervalOptions = Readonly<{
  immediate?: boolean
  onFocus?: boolean
}>

export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  enabled: boolean,
  { immediate = false, onFocus = true }: VisibleIntervalOptions = {}
) {
  const onTick = useEffectEvent(callback)

  useEffect(() => {
    if (!enabled || typeof document === "undefined") return undefined

    const runIfVisible = () => {
      if (document.visibilityState === "visible") onTick()
    }

    if (immediate) runIfVisible()
    const interval = window.setInterval(runIfVisible, intervalMs)
    document.addEventListener("visibilitychange", runIfVisible)
    if (onFocus) window.addEventListener("focus", runIfVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", runIfVisible)
      window.removeEventListener("focus", runIfVisible)
    }
  }, [enabled, intervalMs, immediate, onFocus])
}
