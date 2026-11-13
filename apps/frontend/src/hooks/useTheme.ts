import * as Schema from "effect/Schema"
import { Monitor, Moon, Sun } from "lucide-react"
import { useCallback, useEffect } from "react"

import type { SegmentedItem } from "@/components/ui/segmented-tabs"
import {
  createLocalStorageStringCodec,
  useLocalStorageState
} from "@/hooks/useLocalStorageState"
import { m } from "@/paraglide/messages"

const ThemePreference = Schema.Literals(["light", "dark", "system"])
export type ThemePreference = typeof ThemePreference.Type
export type ResolvedTheme = "light" | "dark"

export const THEME_ITEMS = [
  { key: "light", label: m.theme_light(), icon: Sun },
  { key: "system", label: m.theme_system(), icon: Monitor },
  { key: "dark", label: m.theme_dark(), icon: Moon }
] as const satisfies ReadonlyArray<SegmentedItem<ThemePreference>>

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
        const root = document.documentElement
        root.classList.add("pp-theme-switching")
        void document
          .startViewTransition(apply)
          .finished.finally(() => root.classList.remove("pp-theme-switching"))
      } else {
        apply()
      }
    },
    [storePreference]
  )

  return { preference, setPreference }
}
