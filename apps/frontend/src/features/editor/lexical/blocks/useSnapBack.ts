import { useCallback, useEffect, useState } from "react"

export const SNAP_BACK_MS = 4000

export function useSnapBack(timeoutMs: number = SNAP_BACK_MS) {
  const [armed, setArmed] = useState(false)

  useEffect(() => {
    if (!armed) return
    const timer = window.setTimeout(() => setArmed(false), timeoutMs)
    return () => window.clearTimeout(timer)
  }, [armed, timeoutMs])

  const arm = useCallback(() => setArmed(true), [])
  const disarm = useCallback(() => setArmed(false), [])

  return { armed, arm, disarm }
}
