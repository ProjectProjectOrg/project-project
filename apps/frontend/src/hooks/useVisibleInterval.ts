import { useEffect, useEffectEvent } from "react"

type VisibleIntervalOptions = Readonly<{ immediate?: boolean }>

export function useVisibleInterval(
  callback: () => void,
  intervalMs: number,
  enabled: boolean,
  { immediate = false }: VisibleIntervalOptions = {}
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
    window.addEventListener("focus", runIfVisible)

    return () => {
      window.clearInterval(interval)
      document.removeEventListener("visibilitychange", runIfVisible)
      window.removeEventListener("focus", runIfVisible)
    }
  }, [enabled, intervalMs, immediate])
}
