import { useEffect, useRef, type RefObject } from "react"

export function useMountedRef(): RefObject<boolean> {
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  return mounted
}
