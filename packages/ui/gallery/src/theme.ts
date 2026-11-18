import { useSyncExternalStore } from "react"

export type Theme = "light" | "dark"
export type ThemePreference = "light" | "system" | "dark"

const STORAGE_KEY = "pp-gallery:theme"

// Matches the app: the switcher's pill slides first, then the theme changes.
const REVEAL_DELAY_MS = 200

const subscribe = (onChange: () => void) => {
  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"]
  })
  return () => observer.disconnect()
}

const current = (): Theme =>
  document.documentElement.classList.contains("dark") ? "dark" : "light"

/** The theme on screen, light or dark. */
export const useTheme = () => useSyncExternalStore(subscribe, current)

const listeners = new Set<() => void>()

function stored(): ThemePreference {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value === "light" || value === "dark" ? value : "system"
  } catch {
    return "system"
  }
}

let preference: ThemePreference = stored()

const subscribePreference = (onChange: () => void) => {
  listeners.add(onChange)
  return () => listeners.delete(onChange)
}

/** The chosen preference, including "system". */
export const useThemePreference = () =>
  useSyncExternalStore(subscribePreference, () => preference)

const prefersDark = () => matchMedia("(prefers-color-scheme: dark)").matches

const resolve = (next: ThemePreference): Theme =>
  next === "system" ? (prefersDark() ? "dark" : "light") : next

const apply = (theme: Theme) =>
  document.documentElement.classList.toggle("dark", theme === "dark")

matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (preference === "system") apply(resolve("system"))
})

export function setThemePreference(next: ThemePreference) {
  preference = next
  try {
    localStorage.setItem(STORAGE_KEY, next)
  } catch {
    // Storage can be unavailable; the choice still applies for this visit.
  }
  for (const listener of listeners) listener()
  const theme = resolve(next)
  if (theme === current()) return
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches
  if (!("startViewTransition" in document) || reduceMotion) {
    apply(theme)
    return
  }
  window.setTimeout(
    () => document.startViewTransition(() => apply(theme)),
    REVEAL_DELAY_MS
  )
}
