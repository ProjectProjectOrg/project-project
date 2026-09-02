import type { MouseEvent } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { getThemeRevealRadius } from "@/lib/themeReveal"
import { TabsSubtle, TabsSubtleItem } from "@/components/ui/tabs-subtle"
import { useTheme, type ThemePreference } from "@/hooks/useTheme"
import { m } from "@/paraglide/messages"

const options: ReadonlyArray<{
  value: ThemePreference
  label: () => string
  icon: typeof Sun
}> = [
  { value: "light", label: m.theme_light, icon: Sun },
  { value: "system", label: m.theme_system, icon: Monitor },
  { value: "dark", label: m.theme_dark, icon: Moon }
]

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme()
  const selectedIndex = options.findIndex((o) => o.value === preference)

  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const root = document.documentElement
    root.style.setProperty("--theme-clip-x", `${e.clientX}px`)
    root.style.setProperty("--theme-clip-y", `${e.clientY}px`)
    root.style.setProperty(
      "--theme-clip-radius",
      `${getThemeRevealRadius(
        e.clientX,
        e.clientY,
        window.innerWidth,
        window.innerHeight
      )}px`
    )
  }

  const handleSelect = (i: number) => {
    const next = options[i].value
    if (next === preference) return
    setPreference(next)
  }

  return (
    <div onClickCapture={handleClickCapture}>
      <TabsSubtle
        selectedIndex={selectedIndex}
        onSelect={handleSelect}
        activeLabel
        idPrefix="theme-switcher"
      >
        {options.map((opt, i) => (
          <TabsSubtleItem
            key={opt.value}
            index={i}
            icon={opt.icon}
            label={opt.label()}
          />
        ))}
      </TabsSubtle>
    </div>
  )
}
