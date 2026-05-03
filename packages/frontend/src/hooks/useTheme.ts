import { useCallback, useEffect, useState } from "react"

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "projectproject:theme"

function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system"
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") return stored
  return "system"
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolve(pref: ThemePreference): ResolvedTheme {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light"
  return pref
}

function applyResolved(pref: ThemePreference) {
  const next = resolve(pref)
  document.documentElement.classList.toggle("dark", next === "dark")
}

export function useTheme() {
  const [preference, setPreferenceState] = useState<ThemePreference>(readPreference)

  // Live-track OS-level theme changes when the user has chosen "system".
  useEffect(() => {
    if (preference !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyResolved("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [preference])

  const setPreference = useCallback((next: ThemePreference) => {
    // The DOM mutation that drives the visual change (the `dark` class) has to
    // happen *inside* the view-transition callback so the API can snapshot
    // before/after. The React state update can lag behind safely — only the
    // pill highlight depends on it, and it'll commit before paint.
    const apply = () => {
      applyResolved(next)
      window.localStorage.setItem(STORAGE_KEY, next)
      setPreferenceState(next)
    }

    if (typeof document !== "undefined" && "startViewTransition" in document) {
      document.startViewTransition(apply)
    } else {
      apply()
    }
  }, [])

  return { preference, setPreference }
}
