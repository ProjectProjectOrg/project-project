import { useSyncExternalStore } from "react"

import { preloadPath } from "./registry"

const subscribe = (onChange: () => void) => {
  window.addEventListener("popstate", onChange)
  return () => window.removeEventListener("popstate", onChange)
}

export const usePath = () =>
  useSyncExternalStore(subscribe, () => window.location.pathname)

// Waits for the next page to load, so the old page stays up until the new
// one can show in full.
export async function navigate(path: string) {
  if (path === window.location.pathname) return
  await preloadPath(path)
  if (path === window.location.pathname) return
  window.history.pushState(null, "", path)
  window.dispatchEvent(new PopStateEvent("popstate"))
  window.scrollTo({ top: 0 })
}
