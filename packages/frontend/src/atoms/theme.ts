import { Atom } from "@effect-atom/atom-react"

export type ThemePreference = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

const STORAGE_KEY = "projectproject:theme"

export function readPreference(): ThemePreference {
  if (typeof window === "undefined") return "system"
  const stored = window.localStorage.getItem(STORAGE_KEY)
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored
  }
  return "system"
}

export function readSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined") return "light"
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light"
}

export function resolveTheme(
  preference: ThemePreference,
  systemTheme: ResolvedTheme
): ResolvedTheme {
  return preference === "system" ? systemTheme : preference
}

export function applyResolvedTheme(resolvedTheme: ResolvedTheme) {
  if (typeof document === "undefined") return
  document.documentElement.classList.toggle("dark", resolvedTheme === "dark")
}

export const themePreferenceAtom = Atom.writable<ThemePreference, ThemePreference>(
  () => readPreference(),
  (ctx, preference) => {
    ctx.setSelf(preference)
  }
)

export const systemThemeAtom = Atom.writable<ResolvedTheme, ResolvedTheme>(
  () => readSystemTheme(),
  (ctx, systemTheme) => {
    ctx.setSelf(systemTheme)
  }
)

export const resolvedThemeAtom = Atom.readable((get) =>
  resolveTheme(get.get(themePreferenceAtom), get.get(systemThemeAtom))
)

export const setThemePreferenceAtom = Atom.writable<
  ThemePreference,
  ThemePreference
>(
  (get) => get.get(themePreferenceAtom),
  (ctx, preference) => {
    const systemTheme = ctx.get(systemThemeAtom)
    const resolvedTheme = resolveTheme(preference, systemTheme)

    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, preference)
    }

    applyResolvedTheme(resolvedTheme)
    ctx.set(themePreferenceAtom, preference)
  }
)
