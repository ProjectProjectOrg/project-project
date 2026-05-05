import type { MouseEvent } from "react"
import { Monitor, Moon, Sun } from "lucide-react"
import { TabsSubtle, TabsSubtleItem } from "@/components/ui/tabs-subtle"
import { type ThemePreference, useTheme } from "@/hooks/useTheme"

const options: ReadonlyArray<{
  value: ThemePreference
  label: string
  icon: typeof Sun
}> = [
  { value: "light", label: "Light", icon: Sun },
  { value: "system", label: "System", icon: Monitor },
  { value: "dark", label: "Dark", icon: Moon }
]

export function ThemeSwitcher() {
  const { preference, setPreference } = useTheme()
  const selectedIndex = options.findIndex((o) => o.value === preference)

  // Stash the click point on <html> so the view-transition keyframe in
  // styles.css can center its expanding circle there. Capture-phase so we set
  // it before the click triggers the state change.
  const handleClickCapture = (e: MouseEvent<HTMLDivElement>) => {
    const root = document.documentElement
    root.style.setProperty("--theme-clip-x", `${e.clientX}px`)
    root.style.setProperty("--theme-clip-y", `${e.clientY}px`)
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
            label={opt.label}
          />
        ))}
      </TabsSubtle>
    </div>
  )
}
