import * as Schema from "effect/Schema"
import { useCallback, useEffect } from "react"

import {
  createLocalStorageStringCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"

const ThemePreference = Schema.Literals(["light", "dark", "system"])
export type ThemePreference = typeof ThemePreference.Type
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "projectproject:theme"
const themeCodec = createLocalStorageStringCodec(ThemePreference)

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
  const [preference, storePreference] = useLocalStorageState(
    STORAGE_KEY,
    themeCodec,
    "system"
  )

  useEffect(() => {
    applyResolved(preference)
    if (preference !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyResolved("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [preference])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      const apply = () => {
        applyResolved(next)
        storePreference(next)
      }
      if (
        typeof document !== "undefined" &&
        "startViewTransition" in document
      ) {
        document.startViewTransition(apply)
      } else {
        apply()
      }
    },
    [storePreference]
  )

  return { preference, setPreference }
}
