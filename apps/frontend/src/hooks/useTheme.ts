import { Monitor, Moon, Sun } from "@pp/ui/icons"
import type { SegmentedItem } from "@pp/ui/segmented-tabs"
import * as Schema from "effect/Schema"
import { useCallback, useEffect } from "react"

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

function systemPrefersDark() {
  if (typeof window === "undefined") return false
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function resolve(pref: ThemePreference) {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light"
  return pref
}

function applyResolved(pref: ThemePreference) {
  const next = resolve(pref)
  document.documentElement.classList.toggle("dark", next === "dark")
}

// The theme switcher's pill slides for 280ms. The page-wide reveal waits most
// of that out: the reveal snapshots the page, so a slide running inside it
// would be hidden until the circle passed, and the old tab would seem to
// vanish.
const REVEAL_DELAY_MS = 200

// Module-wide, since every useTheme() instance shares the stored preference
// and would otherwise apply the new theme before the reveal.
const reveal = { pending: false }

export function useTheme() {
  const [preference, storePreference] = useLocalStorageState(
    STORAGE_KEY,
    themeCodec,
    "system"
  )

  useEffect(() => {
    if (!reveal.pending) applyResolved(preference)
    if (preference !== "system") return
    const mq = window.matchMedia("(prefers-color-scheme: dark)")
    const onChange = () => applyResolved("system")
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  }, [preference])

  const setPreference = useCallback(
    (next: ThemePreference) => {
      const canReveal =
        typeof document !== "undefined" &&
        "startViewTransition" in document &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      if (!canReveal) {
        storePreference(next)
        return
      }
      reveal.pending = true
      storePreference(next)
      window.setTimeout(() => {
        document.startViewTransition(() => {
          applyResolved(next)
          reveal.pending = false
        })
      }, REVEAL_DELAY_MS)
    },
    [storePreference]
  )

  return { preference, setPreference }
}
