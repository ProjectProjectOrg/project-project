import { useAtomSet, useAtomValue } from "@effect-atom/atom-react"
import { useCallback, useEffect } from "react"
import {
  applyResolvedTheme,
  resolvedThemeAtom,
  setThemePreferenceAtom,
  systemThemeAtom,
  themePreferenceAtom,
  type ResolvedTheme,
  type ThemePreference
} from "@/atoms/theme"

export function useTheme() {
  const preference = useAtomValue(themePreferenceAtom)
  const resolvedTheme = useAtomValue(resolvedThemeAtom)
  const setPreferenceState = useAtomSet(setThemePreferenceAtom)
  const setSystemTheme = useAtomSet(systemThemeAtom)

  useEffect(() => {
    applyResolvedTheme(resolvedTheme)
  }, [resolvedTheme])

  // Live-track OS-level theme changes when the user has chosen "system".
  useEffect(() => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = (event: MediaQueryListEvent) => {
      const nextSystemTheme: ResolvedTheme = event.matches ? "dark" : "light"
      setSystemTheme(nextSystemTheme)
      if (preference === "system") applyResolvedTheme(nextSystemTheme)
    }
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [preference, setSystemTheme])

  const setPreference = useCallback((next: ThemePreference) => {
    // The DOM mutation that drives the visual change (the `dark` class) has to
    // happen *inside* the view-transition callback so the API can snapshot
    // before/after. The atom update is synchronous, so subscribers see the same
    // resolved theme that was applied to the DOM.
    const apply = () => {
      setPreferenceState(next)
    }

    if (typeof document !== "undefined" && "startViewTransition" in document) {
      document.startViewTransition(apply)
    } else {
      apply()
    }
  }, [setPreferenceState])

  return { preference, resolvedTheme, setPreference }
}

export type { ResolvedTheme, ThemePreference }
