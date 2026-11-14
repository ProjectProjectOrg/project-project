import { useSyncExternalStore } from "react"

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

export const usePath = () =>
  useSyncExternalStore(subscribe, () => window.location.pathname)

export function navigate(path: string) {
  if (path === window.location.pathname) return
  window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo({ top: 0 })
}
