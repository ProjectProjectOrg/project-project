import { useRef } from "react"

export function useCommandAction() {
  const pending = useRef(false)
  return (action: () => Promise<void>) => {
    if (pending.current) return
    pending.current = true
    return action().finally(() => {
      pending.current = false
    })
  }
}
